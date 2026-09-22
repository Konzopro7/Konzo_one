import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.use(requireAuth);

const clientSchema = z.object({
  name: z.string().min(2, "Name is required."),
  company: z.string().optional(),
  email: z.string().email("Invalid email."),
  phone: z.string().optional()
});

function parseId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        c.id,
        c.name,
        c.company,
        c.email,
        c.phone,
        c.created_at,
        c.updated_at,
        COALESCE(q.quotes_count, 0)::INT AS quotes_count,
        COALESCE(i.invoices_count, 0)::INT AS invoices_count,
        COALESCE(i.paid_total, 0)::NUMERIC(12, 2) AS paid_total
      FROM clients c
      LEFT JOIN (
        SELECT client_id, COUNT(*) AS quotes_count FROM quotes
        WHERE agency_id = $1 GROUP BY client_id
      ) q ON q.client_id = c.id
      LEFT JOIN (
        SELECT client_id, COUNT(*) AS invoices_count,
          SUM(total) FILTER (WHERE status = 'paid') AS paid_total
        FROM invoices WHERE agency_id = $1 GROUP BY client_id
      ) i ON i.client_id = c.id
      WHERE c.agency_id = $1
      ORDER BY c.created_at DESC`,
      [req.user.agencyId]
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        quotesCount: Number(row.quotes_count || 0),
        invoicesCount: Number(row.invoices_count || 0),
        paidTotal: Number(row.paid_total || 0),
        createdAt: row.created_at
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
      return res.status(400).json({ message: "Invalid client id." });
    }

    const clientRes = await query(
      `SELECT id, name, company, email, phone, created_at, updated_at
       FROM clients
       WHERE id = $1 AND agency_id = $2`,
      [id, req.user.agencyId]
    );

    if (!clientRes.rows[0]) {
      return res.status(404).json({ message: "Client not found." });
    }

    const [quotesRes, invoicesRes] = await Promise.all([
      query(
        `SELECT id, quote_number, status, issue_date, total
         FROM quotes
         WHERE agency_id = $1 AND client_id = $2
         ORDER BY created_at DESC`,
        [req.user.agencyId, id]
      ),
      query(
        `SELECT id, invoice_number, status, issue_date, due_date, total
         FROM invoices
         WHERE agency_id = $1 AND client_id = $2
         ORDER BY created_at DESC`,
        [req.user.agencyId, id]
      )
    ]);

    const client = clientRes.rows[0];
    return res.json({
      id: client.id,
      name: client.name,
      company: client.company,
      email: client.email,
      phone: client.phone,
      createdAt: client.created_at,
      updatedAt: client.updated_at,
      quotes: quotesRes.rows.map((row) => ({
        id: row.id,
        quoteNumber: row.quote_number,
        status: row.status,
        issueDate: row.issue_date,
        total: Number(row.total || 0)
      })),
      invoices: invoicesRes.rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        status: row.status,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        total: Number(row.total || 0)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const parsed = clientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const { rows } = await query(
      `INSERT INTO clients (agency_id, created_by, name, company, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, company, email, phone, created_at`,
      [
        req.user.agencyId,
        req.user.id,
        payload.name.trim(),
        payload.company?.trim() || null,
        payload.email.trim().toLowerCase(),
        payload.phone?.trim() || null
      ]
    );

    const client = rows[0];
    return res.status(201).json({
      id: client.id,
      name: client.name,
      company: client.company,
      email: client.email,
      phone: client.phone,
      createdAt: client.created_at
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid client id." });
    }

    const parsed = clientSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const { rows } = await query(
      `UPDATE clients
       SET name = $1,
           company = $2,
           email = $3,
           phone = $4
       WHERE id = $5 AND agency_id = $6
       RETURNING id, name, company, email, phone, updated_at`,
      [
        payload.name.trim(),
        payload.company?.trim() || null,
        payload.email.trim().toLowerCase(),
        payload.phone?.trim() || null,
        id,
        req.user.agencyId
      ]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "Client not found." });
    }

    return res.json({
      id: rows[0].id,
      name: rows[0].name,
      company: rows[0].company,
      email: rows[0].email,
      phone: rows[0].phone,
      updatedAt: rows[0].updated_at
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid client id." });
    }

    const linked = await query(
      `SELECT
         (SELECT COUNT(*) FROM quotes WHERE agency_id = $1 AND client_id = $2)::INT AS quotes_count,
         (SELECT COUNT(*) FROM invoices WHERE agency_id = $1 AND client_id = $2)::INT AS invoices_count`,
      [req.user.agencyId, id]
    );
    const counters = linked.rows[0];

    if (counters.quotes_count > 0 || counters.invoices_count > 0) {
      return res.status(409).json({
        message: "This client already has related quotes or invoices."
      });
    }

    const result = await query(
      "DELETE FROM clients WHERE id = $1 AND agency_id = $2 RETURNING id",
      [id, req.user.agencyId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ message: "Client not found." });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
