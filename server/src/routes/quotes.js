import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { computeTotals, normalizeItems } from "../utils/calculations.js";
import { generateInvoiceNumber, generateQuoteNumber } from "../utils/docNumbers.js";
import { buildBusinessPdf } from "../services/pdf.js";
import { sendDocumentByEmail } from "../services/mailer.js";
import { buildPortalUrl, renderTemplate } from "../services/templates.js";

const router = Router();

router.use(requireAuth);

const quoteSchema = z.object({
  clientId: z.number().int().positive(),
  status: z.enum(["draft", "sent", "accepted", "refused"]).default("draft"),
  validUntil: z.string().optional().nullable(),
  taxRate: z.number().min(0).max(1).default(0.2),
  notes: z.string().optional().nullable(),
  items: z.array(
    z.object({
      description: z.string().min(1),
      unitPrice: z.coerce.number().nonnegative(),
      quantity: z.coerce.number().positive()
    })
  )
});

const statusSchema = z.object({
  status: z.enum(["draft", "sent", "accepted", "refused"])
});

function parseId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function mapQuoteRow(row) {
  return {
    id: row.id,
    quoteNumber: row.quote_number,
    status: row.status,
    issueDate: row.issue_date,
    validUntil: row.valid_until,
    subtotal: Number(row.subtotal || 0),
    taxRate: Number(row.tax_rate || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    notes: row.notes,
    publicToken: row.public_token,
    client: {
      id: row.client_id,
      name: row.client_name,
      company: row.client_company,
      email: row.client_email,
      phone: row.client_phone
    }
  };
}

function mapItemRow(row) {
  return {
    id: row.id,
    description: row.description,
    unitPrice: Number(row.unit_price || 0),
    quantity: Number(row.quantity || 0),
    lineTotal: Number(row.line_total || 0)
  };
}

async function fetchQuoteById(agencyId, quoteId) {
  const { rows } = await query(
    `SELECT
      q.*,
      c.name AS client_name,
      c.company AS client_company,
      c.email AS client_email,
      c.phone AS client_phone
    FROM quotes q
    INNER JOIN clients c ON c.id = q.client_id
    WHERE q.id = $1 AND q.agency_id = $2`,
    [quoteId, agencyId]
  );

  if (!rows[0]) {
    return null;
  }

  const itemResult = await query(
    `SELECT id, description, unit_price, quantity, line_total
     FROM quote_items
     WHERE quote_id = $1
     ORDER BY id ASC`,
    [quoteId]
  );

  return {
    ...mapQuoteRow(rows[0]),
    items: itemResult.rows.map(mapItemRow)
  };
}

async function fetchSettings(agencyId) {
  const { rows } = await query(
    `SELECT
      agency_name,
      agency_email,
      agency_phone,
      payment_terms,
      currency,
      logo_url,
      quote_email_subject,
      quote_email_body
     FROM agency_settings
     WHERE agency_id = $1`,
    [agencyId]
  );
  return rows[0] || null;
}

async function ensureQuoteToken(quoteId, agencyId) {
  const existing = await query(
    `SELECT public_token
     FROM quotes
     WHERE id = $1 AND agency_id = $2`,
    [quoteId, agencyId]
  );
  if (!existing.rows[0]) {
    const error = new Error("Quote not found.");
    error.status = 404;
    throw error;
  }
  if (existing.rows[0]?.public_token) {
    return existing.rows[0].public_token;
  }

  const token = crypto.randomBytes(16).toString("hex");
  const { rows } = await query(
    `UPDATE quotes
     SET public_token = $1
     WHERE id = $2 AND agency_id = $3
     RETURNING public_token`,
    [token, quoteId, agencyId]
  );
  return rows[0].public_token;
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        q.id,
        q.quote_number,
        q.status,
        q.issue_date,
        q.valid_until,
        q.total,
        q.public_token,
        c.id AS client_id,
        c.name AS client_name,
        c.company AS client_company
      FROM quotes q
      INNER JOIN clients c ON c.id = q.client_id
      WHERE q.agency_id = $1
      ORDER BY q.created_at DESC`,
      [req.user.agencyId]
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        quoteNumber: row.quote_number,
        status: row.status,
        issueDate: row.issue_date,
        validUntil: row.valid_until,
        total: Number(row.total || 0),
        publicToken: row.public_token,
        client: {
          id: row.client_id,
          name: row.client_name,
          company: row.client_company
        }
      }))
    );
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid quote id." });
    }

    const quote = await fetchQuoteById(req.user.agencyId, id);
    if (!quote) {
      return res.status(404).json({ message: "Quote not found." });
    }

    return res.json(quote);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.post("/", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const normalizedItems = normalizeItems(payload.items);
    if (normalizedItems.length === 0) {
      return res.status(400).json({ message: "Add at least one service line." });
    }

    const totals = computeTotals(normalizedItems, payload.taxRate);
    let quoteId;

    await withTransaction(async (client) => {
      const clientCheck = await client.query(
        "SELECT id FROM clients WHERE id = $1 AND agency_id = $2",
        [payload.clientId, req.user.agencyId]
      );
      if (!clientCheck.rows[0]) {
        const error = new Error("Client not found.");
        error.status = 404;
        throw error;
      }

      const quoteNumber = await generateQuoteNumber(client, req.user.agencyId);
      const insertQuote = await client.query(
        `INSERT INTO quotes (
          agency_id,
          created_by,
          client_id,
          quote_number,
          status,
          valid_until,
          subtotal,
          tax_rate,
          tax_amount,
          total,
          notes,
          public_token
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          req.user.agencyId,
          req.user.id,
          payload.clientId,
          quoteNumber,
          payload.status,
          payload.validUntil || null,
          totals.subtotal,
          totals.taxRate,
          totals.taxAmount,
          totals.total,
          payload.notes?.trim() || null,
          crypto.randomBytes(16).toString("hex")
        ]
      );

      quoteId = insertQuote.rows[0].id;

      for (const item of totals.items) {
        await client.query(
          `INSERT INTO quote_items (quote_id, description, unit_price, quantity, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [quoteId, item.description, item.unitPrice, item.quantity, item.lineTotal]
        );
      }
    });

    const createdQuote = await fetchQuoteById(req.user.agencyId, quoteId);
    return res.status(201).json(createdQuote);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.put("/:id", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid quote id." });
    }

    const parsed = quoteSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const normalizedItems = normalizeItems(payload.items);
    if (normalizedItems.length === 0) {
      return res.status(400).json({ message: "Add at least one service line." });
    }

    const totals = computeTotals(normalizedItems, payload.taxRate);

    await withTransaction(async (client) => {
      const quoteCheck = await client.query(
        "SELECT id FROM quotes WHERE id = $1 AND agency_id = $2",
        [id, req.user.agencyId]
      );
      if (!quoteCheck.rows[0]) {
        const error = new Error("Quote not found.");
        error.status = 404;
        throw error;
      }

      const clientCheck = await client.query(
        "SELECT id FROM clients WHERE id = $1 AND agency_id = $2",
        [payload.clientId, req.user.agencyId]
      );
      if (!clientCheck.rows[0]) {
        const error = new Error("Client not found.");
        error.status = 404;
        throw error;
      }

      await client.query(
        `UPDATE quotes
         SET client_id = $1,
             status = $2,
             valid_until = $3,
             subtotal = $4,
             tax_rate = $5,
             tax_amount = $6,
             total = $7,
             notes = $8
         WHERE id = $9 AND agency_id = $10`,
        [
          payload.clientId,
          payload.status,
          payload.validUntil || null,
          totals.subtotal,
          totals.taxRate,
          totals.taxAmount,
          totals.total,
          payload.notes?.trim() || null,
          id,
          req.user.agencyId
        ]
      );

      await client.query("DELETE FROM quote_items WHERE quote_id = $1", [id]);
      for (const item of totals.items) {
        await client.query(
          `INSERT INTO quote_items (quote_id, description, unit_price, quantity, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, item.description, item.unitPrice, item.quantity, item.lineTotal]
        );
      }
    });

    const updatedQuote = await fetchQuoteById(req.user.agencyId, id);
    return res.json(updatedQuote);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.patch("/:id/status", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid quote id." });
    }

    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const updateResult = await query(
      `UPDATE quotes
       SET status = $1
       WHERE id = $2 AND agency_id = $3
       RETURNING id`,
      [parsed.data.status, id, req.user.agencyId]
    );

    if (!updateResult.rows[0]) {
      return res.status(404).json({ message: "Quote not found." });
    }

    const quote = await fetchQuoteById(req.user.agencyId, id);
    return res.json(quote);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/convert-to-invoice", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid quote id." });
    }

    let createdInvoice;

    await withTransaction(async (client) => {
      const quoteResult = await client.query(
        `SELECT
          id,
          agency_id,
          client_id,
          total,
          subtotal,
          tax_rate,
          tax_amount,
          status
        FROM quotes
        WHERE id = $1 AND agency_id = $2`,
        [id, req.user.agencyId]
      );

      const quote = quoteResult.rows[0];
      if (!quote) {
        const error = new Error("Quote not found.");
        error.status = 404;
        throw error;
      }

      const existingInvoice = await client.query(
        `SELECT id, invoice_number
         FROM invoices
         WHERE quote_id = $1 AND agency_id = $2`,
        [id, req.user.agencyId]
      );

      if (existingInvoice.rows[0]) {
        const error = new Error(
          `Quote already converted (${existingInvoice.rows[0].invoice_number}).`
        );
        error.status = 409;
        throw error;
      }

      const itemRows = await client.query(
        `SELECT description, unit_price, quantity, line_total
         FROM quote_items
         WHERE quote_id = $1
         ORDER BY id ASC`,
        [id]
      );

      const invoiceNumber = await generateInvoiceNumber(client, req.user.agencyId);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);
      const paymentLinkToken = crypto.randomBytes(16).toString("hex");

      const created = await client.query(
        `INSERT INTO invoices (
          agency_id,
          created_by,
          quote_id,
          client_id,
          invoice_number,
          status,
          issue_date,
          due_date,
          payment_method,
          subtotal,
          tax_rate,
          tax_amount,
          total,
          payment_link_token
        )
        VALUES ($1, $2, $3, $4, $5, 'pending', CURRENT_DATE, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, invoice_number, payment_link_token`,
        [
          req.user.agencyId,
          req.user.id,
          id,
          quote.client_id,
          invoiceNumber,
          dueDate.toISOString().slice(0, 10),
          "bank_transfer",
          quote.subtotal,
          quote.tax_rate,
          quote.tax_amount,
          quote.total,
          paymentLinkToken
        ]
      );

      const invoiceId = created.rows[0].id;
      for (const item of itemRows.rows) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, description, unit_price, quantity, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [invoiceId, item.description, item.unit_price, item.quantity, item.line_total]
        );
      }

      if (quote.status !== "accepted") {
        await client.query(
          `UPDATE quotes
           SET status = 'accepted'
           WHERE id = $1`,
          [id]
        );
      }

      createdInvoice = {
        id: invoiceId,
        invoiceNumber: created.rows[0].invoice_number,
        paymentLinkToken: created.rows[0].payment_link_token
      };
    });

    return res.status(201).json({
      message: "Quote converted successfully.",
      invoice: createdInvoice
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid quote id." });
    }

    const quote = await fetchQuoteById(req.user.agencyId, id);
    if (!quote) {
      return res.status(404).json({ message: "Quote not found." });
    }

    const settings = await fetchSettings(req.user.agencyId);
    const buffer = await buildBusinessPdf({
      documentType: "quote",
      data: {
        number: quote.quoteNumber,
        issueDate: quote.issueDate,
        validUntil: quote.validUntil,
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        total: quote.total
      },
      items: quote.items,
      client: quote.client,
      settings
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${quote.quoteNumber}.pdf\"`
    );
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/public-link", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid quote id." });
    }

    const token = await ensureQuoteToken(id, req.user.agencyId);
    return res.json({
      token,
      portalUrl: buildPortalUrl("quotes", token)
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.post("/:id/send-email", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid quote id." });
    }

    const quote = await fetchQuoteById(req.user.agencyId, id);
    if (!quote) {
      return res.status(404).json({ message: "Quote not found." });
    }

    const settings = await fetchSettings(req.user.agencyId);
    const buffer = await buildBusinessPdf({
      documentType: "quote",
      data: {
        number: quote.quoteNumber,
        issueDate: quote.issueDate,
        validUntil: quote.validUntil,
        subtotal: quote.subtotal,
        taxAmount: quote.taxAmount,
        total: quote.total
      },
      items: quote.items,
      client: quote.client,
      settings
    });

    const token = await ensureQuoteToken(id, req.user.agencyId);
    const portalUrl = buildPortalUrl("quotes", token);
    const variables = {
      agencyName: settings?.agency_name || "Konzotech Agency",
      clientName: quote.client.name,
      documentNumber: quote.quoteNumber,
      total: String(quote.total),
      portalUrl
    };

    const result = await sendDocumentByEmail({
      to: quote.client.email,
      subject: renderTemplate(
        settings?.quote_email_subject || "Votre devis {{documentNumber}} - {{agencyName}}",
        variables
      ),
      html: renderTemplate(
        settings?.quote_email_body ||
          "<p>Bonjour {{clientName}},</p><p>Votre devis {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>",
        variables
      ),
      pdfBuffer: buffer,
      filename: `${quote.quoteNumber}.pdf`
    });

    return res.json({
      message: "Quote email sent.",
      deliveryMode: result.mode,
      preview: result.preview
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid quote id." });
    }

    const result = await query(
      "DELETE FROM quotes WHERE id = $1 AND agency_id = $2 RETURNING id",
      [id, req.user.agencyId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Quote not found." });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
