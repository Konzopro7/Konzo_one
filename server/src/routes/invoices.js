import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { computeTotals, normalizeItems } from "../utils/calculations.js";
import { generateInvoiceNumber } from "../utils/docNumbers.js";
import { buildBusinessPdf } from "../services/pdf.js";
import { sendDocumentByEmail } from "../services/mailer.js";
import { buildPortalUrl, renderTemplate } from "../services/templates.js";

const router = Router();

router.use(requireAuth);

const invoiceSchema = z.object({
  clientId: z.number().int().positive(),
  status: z.enum(["paid", "pending"]).default("pending"),
  dueDate: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
  taxRate: z.number().min(0).max(1).default(0.2),
  items: z.array(
    z.object({
      description: z.string().min(1),
      unitPrice: z.coerce.number().nonnegative(),
      quantity: z.coerce.number().positive()
    })
  )
});

const statusSchema = z.object({
  status: z.enum(["paid", "pending"])
});

function parseId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function mapInvoiceRow(row) {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    status: row.status,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    paymentMethod: row.payment_method,
    subtotal: Number(row.subtotal || 0),
    taxRate: Number(row.tax_rate || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    quoteId: row.quote_id,
    paymentLinkToken: row.payment_link_token,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripePaymentIntentId: row.stripe_payment_intent_id,
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

async function fetchInvoiceById(agencyId, invoiceId) {
  const { rows } = await query(
    `SELECT
      i.*,
      c.name AS client_name,
      c.company AS client_company,
      c.email AS client_email,
      c.phone AS client_phone
    FROM invoices i
    INNER JOIN clients c ON c.id = i.client_id
    WHERE i.id = $1 AND i.agency_id = $2`,
    [invoiceId, agencyId]
  );

  if (!rows[0]) {
    return null;
  }

  const itemResult = await query(
    `SELECT id, description, unit_price, quantity, line_total
     FROM invoice_items
     WHERE invoice_id = $1
     ORDER BY id ASC`,
    [invoiceId]
  );

  return {
    ...mapInvoiceRow(rows[0]),
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
      invoice_email_subject,
      invoice_email_body
     FROM agency_settings
     WHERE agency_id = $1`,
    [agencyId]
  );
  return rows[0] || null;
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        i.id,
        i.invoice_number,
        i.status,
        i.issue_date,
        i.due_date,
        i.total,
        i.payment_method,
        i.payment_link_token,
        c.id AS client_id,
        c.name AS client_name,
        c.company AS client_company
      FROM invoices i
      INNER JOIN clients c ON c.id = i.client_id
      WHERE i.agency_id = $1
      ORDER BY i.created_at DESC`,
      [req.user.agencyId]
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        status: row.status,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        total: Number(row.total || 0),
        paymentMethod: row.payment_method,
        paymentLinkToken: row.payment_link_token,
        client: {
          id: row.client_id,
          name: row.client_name,
          company: row.client_company
        }
      }))
    );
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid invoice id." });
    }

    const invoice = await fetchInvoiceById(req.user.agencyId, id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    return res.json(invoice);
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const parsed = invoiceSchema.safeParse(req.body);
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
    let invoiceId;

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

      const invoiceNumber = await generateInvoiceNumber(client, req.user.agencyId);
      const paymentLinkToken = crypto.randomBytes(16).toString("hex");
      const created = await client.query(
        `INSERT INTO invoices (
          agency_id,
          created_by,
          client_id,
          invoice_number,
          status,
          due_date,
          payment_method,
          subtotal,
          tax_rate,
          tax_amount,
          total,
          payment_link_token
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          req.user.agencyId,
          req.user.id,
          payload.clientId,
          invoiceNumber,
          payload.status,
          payload.dueDate || null,
          payload.paymentMethod?.trim() || null,
          totals.subtotal,
          totals.taxRate,
          totals.taxAmount,
          totals.total,
          paymentLinkToken
        ]
      );

      invoiceId = created.rows[0].id;
      for (const item of totals.items) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, description, unit_price, quantity, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [invoiceId, item.description, item.unitPrice, item.quantity, item.lineTotal]
        );
      }
    });

    const invoice = await fetchInvoiceById(req.user.agencyId, invoiceId);
    return res.status(201).json(invoice);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.put("/:id", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid invoice id." });
    }

    const parsed = invoiceSchema.safeParse(req.body);
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
      const invoiceCheck = await client.query(
        "SELECT id FROM invoices WHERE id = $1 AND agency_id = $2",
        [id, req.user.agencyId]
      );
      if (!invoiceCheck.rows[0]) {
        const error = new Error("Invoice not found.");
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
        `UPDATE invoices
         SET client_id = $1,
             status = $2,
             due_date = $3,
             payment_method = $4,
             subtotal = $5,
             tax_rate = $6,
             tax_amount = $7,
             total = $8
         WHERE id = $9 AND agency_id = $10`,
        [
          payload.clientId,
          payload.status,
          payload.dueDate || null,
          payload.paymentMethod?.trim() || null,
          totals.subtotal,
          totals.taxRate,
          totals.taxAmount,
          totals.total,
          id,
          req.user.agencyId
        ]
      );

      await client.query("DELETE FROM invoice_items WHERE invoice_id = $1", [id]);
      for (const item of totals.items) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, description, unit_price, quantity, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, item.description, item.unitPrice, item.quantity, item.lineTotal]
        );
      }
    });

    const invoice = await fetchInvoiceById(req.user.agencyId, id);
    return res.json(invoice);
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.patch("/:id/status", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid invoice id." });
    }

    const parsed = statusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const updateResult = await query(
      `UPDATE invoices
       SET status = $1
       WHERE id = $2 AND agency_id = $3
       RETURNING id`,
      [parsed.data.status, id, req.user.agencyId]
    );

    if (!updateResult.rows[0]) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const invoice = await fetchInvoiceById(req.user.agencyId, id);
    return res.json(invoice);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid invoice id." });
    }

    const invoice = await fetchInvoiceById(req.user.agencyId, id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const settings = await fetchSettings(req.user.agencyId);
    const buffer = await buildBusinessPdf({
      documentType: "invoice",
      data: {
        number: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        total: invoice.total
      },
      items: invoice.items,
      client: invoice.client,
      settings
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${invoice.invoiceNumber}.pdf\"`
    );
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.post("/:id/send-email", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid invoice id." });
    }

    const invoice = await fetchInvoiceById(req.user.agencyId, id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const settings = await fetchSettings(req.user.agencyId);
    const buffer = await buildBusinessPdf({
      documentType: "invoice",
      data: {
        number: invoice.invoiceNumber,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        subtotal: invoice.subtotal,
        taxAmount: invoice.taxAmount,
        total: invoice.total
      },
      items: invoice.items,
      client: invoice.client,
      settings
    });

    const portalUrl = invoice.paymentLinkToken
      ? buildPortalUrl("invoices", invoice.paymentLinkToken)
      : "";
    const variables = {
      agencyName: settings?.agency_name || "Konzotech Agency",
      clientName: invoice.client.name,
      documentNumber: invoice.invoiceNumber,
      total: String(invoice.total),
      portalUrl
    };

    const result = await sendDocumentByEmail({
      to: invoice.client.email,
      subject: renderTemplate(
        settings?.invoice_email_subject || "Votre facture {{documentNumber}} - {{agencyName}}",
        variables
      ),
      html: renderTemplate(
        settings?.invoice_email_body ||
          "<p>Bonjour {{clientName}},</p><p>Votre facture {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>",
        variables
      ),
      pdfBuffer: buffer,
      filename: `${invoice.invoiceNumber}.pdf`
    });

    return res.json({
      message: "Invoice email sent.",
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
      return res.status(400).json({ message: "Invalid invoice id." });
    }

    const result = await query(
      "DELETE FROM invoices WHERE id = $1 AND agency_id = $2 RETURNING id",
      [id, req.user.agencyId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
