import crypto from "crypto";
import { Router } from "express";
import { query, withTransaction } from "../db.js";
import { generateInvoiceNumber } from "../utils/docNumbers.js";
import { buildBusinessPdf } from "../services/pdf.js";

const router = Router();

async function fetchSettings(agencyId) {
  const { rows } = await query(
    `SELECT *
     FROM agency_settings
     WHERE agency_id = $1`,
    [agencyId]
  );
  return rows[0] || null;
}

function mapItem(row) {
  return {
    id: row.id,
    description: row.description,
    unitPrice: Number(row.unit_price || 0),
    quantity: Number(row.quantity || 0),
    lineTotal: Number(row.line_total || 0)
  };
}

async function fetchQuoteByToken(token) {
  const { rows } = await query(
    `SELECT
      q.*,
      c.name AS client_name,
      c.company AS client_company,
      c.email AS client_email,
      c.phone AS client_phone
     FROM quotes q
     INNER JOIN clients c ON c.id = q.client_id
     WHERE q.public_token = $1`,
    [token]
  );
  const quote = rows[0];
  if (!quote) return null;

  const itemRes = await query(
    `SELECT id, description, unit_price, quantity, line_total
     FROM quote_items
     WHERE quote_id = $1
     ORDER BY id ASC`,
    [quote.id]
  );

  return {
    id: quote.id,
    agencyId: quote.agency_id,
    quoteNumber: quote.quote_number,
    status: quote.status,
    issueDate: quote.issue_date,
    validUntil: quote.valid_until,
    subtotal: Number(quote.subtotal || 0),
    taxAmount: Number(quote.tax_amount || 0),
    total: Number(quote.total || 0),
    token: quote.public_token,
    client: {
      id: quote.client_id,
      name: quote.client_name,
      company: quote.client_company,
      email: quote.client_email,
      phone: quote.client_phone
    },
    items: itemRes.rows.map(mapItem)
  };
}

async function fetchInvoiceByToken(token) {
  const { rows } = await query(
    `SELECT
      i.*,
      c.name AS client_name,
      c.company AS client_company,
      c.email AS client_email,
      c.phone AS client_phone
     FROM invoices i
     INNER JOIN clients c ON c.id = i.client_id
     WHERE i.payment_link_token = $1`,
    [token]
  );
  const invoice = rows[0];
  if (!invoice) return null;

  const itemRes = await query(
    `SELECT id, description, unit_price, quantity, line_total
     FROM invoice_items
     WHERE invoice_id = $1
     ORDER BY id ASC`,
    [invoice.id]
  );

  return {
    id: invoice.id,
    agencyId: invoice.agency_id,
    invoiceNumber: invoice.invoice_number,
    status: invoice.status,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    subtotal: Number(invoice.subtotal || 0),
    taxAmount: Number(invoice.tax_amount || 0),
    total: Number(invoice.total || 0),
    token: invoice.payment_link_token,
    client: {
      id: invoice.client_id,
      name: invoice.client_name,
      company: invoice.client_company,
      email: invoice.client_email,
      phone: invoice.client_phone
    },
    items: itemRes.rows.map(mapItem)
  };
}

router.get("/quotes/:token", async (req, res, next) => {
  try {
    const quote = await fetchQuoteByToken(req.params.token);
    if (!quote) return res.status(404).json({ message: "Devis introuvable." });
    const settings = await fetchSettings(quote.agencyId);
    return res.json({
      type: "quote",
      quote,
      agency: {
        name: settings?.agency_name || "Konzotech Agency",
        email: settings?.agency_email || null,
        phone: settings?.agency_phone || null,
        logoUrl: settings?.logo_url || null,
        currency: "CAD"
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/quotes/:token/accept", async (req, res, next) => {
  try {
    let invoiceToken = null;
    let invoiceNumber = null;

    await withTransaction(async (client) => {
      const quoteRes = await client.query(
        `SELECT *
         FROM quotes
         WHERE public_token = $1
         FOR UPDATE`,
        [req.params.token]
      );
      const quote = quoteRes.rows[0];
      if (!quote) {
        const error = new Error("Devis introuvable.");
        error.status = 404;
        throw error;
      }

      await client.query("UPDATE quotes SET status = 'accepted' WHERE id = $1", [quote.id]);

      const existingInvoice = await client.query(
        `SELECT invoice_number, payment_link_token
         FROM invoices
         WHERE quote_id = $1 AND agency_id = $2`,
        [quote.id, quote.agency_id]
      );

      if (existingInvoice.rows[0]) {
        invoiceNumber = existingInvoice.rows[0].invoice_number;
        invoiceToken = existingInvoice.rows[0].payment_link_token;
        return;
      }

      const items = await client.query(
        `SELECT description, unit_price, quantity, line_total
         FROM quote_items
         WHERE quote_id = $1
         ORDER BY id ASC`,
        [quote.id]
      );

      invoiceToken = crypto.randomBytes(16).toString("hex");
      invoiceNumber = await generateInvoiceNumber(client, quote.agency_id);
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 15);

      const invoice = await client.query(
        `INSERT INTO invoices (
          agency_id, quote_id, client_id, invoice_number, status, issue_date, due_date,
          payment_method, subtotal, tax_rate, tax_amount, total, payment_link_token
        )
        VALUES ($1, $2, $3, $4, 'pending', CURRENT_DATE, $5, 'bank_transfer', $6, $7, $8, $9, $10)
        RETURNING id`,
        [
          quote.agency_id,
          quote.id,
          quote.client_id,
          invoiceNumber,
          dueDate.toISOString().slice(0, 10),
          quote.subtotal,
          quote.tax_rate,
          quote.tax_amount,
          quote.total,
          invoiceToken
        ]
      );

      for (const item of items.rows) {
        await client.query(
          `INSERT INTO invoice_items (invoice_id, description, unit_price, quantity, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [invoice.rows[0].id, item.description, item.unit_price, item.quantity, item.line_total]
        );
      }
    });

    return res.json({
      message: "Devis accepté.",
      invoiceNumber,
      invoiceToken
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

router.get("/quotes/:token/pdf", async (req, res, next) => {
  try {
    const quote = await fetchQuoteByToken(req.params.token);
    if (!quote) return res.status(404).json({ message: "Devis introuvable." });
    const settings = await fetchSettings(quote.agencyId);
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
    res.setHeader("Content-Disposition", `attachment; filename="${quote.quoteNumber}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.get("/invoices/:token", async (req, res, next) => {
  try {
    const invoice = await fetchInvoiceByToken(req.params.token);
    if (!invoice) return res.status(404).json({ message: "Facture introuvable." });
    const settings = await fetchSettings(invoice.agencyId);
    return res.json({
      type: "invoice",
      invoice,
      agency: {
        name: settings?.agency_name || "Konzotech Agency",
        email: settings?.agency_email || null,
        phone: settings?.agency_phone || null,
        logoUrl: settings?.logo_url || null,
        currency: "CAD"
      }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/invoices/:token/pdf", async (req, res, next) => {
  try {
    const invoice = await fetchInvoiceByToken(req.params.token);
    if (!invoice) return res.status(404).json({ message: "Facture introuvable." });
    const settings = await fetchSettings(invoice.agencyId);
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
    res.setHeader("Content-Disposition", `attachment; filename="${invoice.invoiceNumber}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

export default router;
