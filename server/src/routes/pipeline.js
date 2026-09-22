import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.use(requireAuth);

const prospectSchema = z.object({
  name: z.string().min(2),
  company: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable(),
  source: z.string().optional().nullable(),
  status: z.enum(["new", "qualified", "lost", "converted"]).default("new"),
  notes: z.string().optional().nullable()
});

const opportunitySchema = z.object({
  prospectId: z.coerce.number().int().positive().optional().nullable(),
  clientId: z.coerce.number().int().positive().optional().nullable(),
  quoteId: z.coerce.number().int().positive().optional().nullable(),
  invoiceId: z.coerce.number().int().positive().optional().nullable(),
  title: z.string().min(2),
  stage: z.enum(["lead", "discovery", "proposal", "won", "lost"]).default("lead"),
  value: z.coerce.number().min(0).default(0),
  probability: z.coerce.number().int().min(0).max(100).default(25),
  expectedCloseDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

function parseId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapProspect(row) {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    email: row.email,
    phone: row.phone,
    source: row.source,
    status: row.status,
    notes: row.notes,
    convertedClientId: row.converted_client_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapOpportunity(row) {
  return {
    id: row.id,
    title: row.title,
    stage: row.stage,
    value: Number(row.value || 0),
    probability: Number(row.probability || 0),
    expectedCloseDate: row.expected_close_date,
    notes: row.notes,
    prospect: row.prospect_id
      ? { id: row.prospect_id, name: row.prospect_name, company: row.prospect_company }
      : null,
    client: row.client_id
      ? { id: row.client_id, name: row.client_name, company: row.client_company }
      : null,
    quoteId: row.quote_id,
    invoiceId: row.invoice_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function ownsOpportunityReferences(agencyId, payload) {
  const { rows } = await query(
    `SELECT
      ($2::INT IS NULL OR EXISTS (SELECT 1 FROM prospects WHERE id = $2 AND agency_id = $1))
      AND ($3::INT IS NULL OR EXISTS (SELECT 1 FROM clients WHERE id = $3 AND agency_id = $1))
      AND ($4::INT IS NULL OR EXISTS (SELECT 1 FROM quotes WHERE id = $4 AND agency_id = $1))
      AND ($5::INT IS NULL OR EXISTS (SELECT 1 FROM invoices WHERE id = $5 AND agency_id = $1)) AS allowed`,
    [agencyId, payload.prospectId ?? null, payload.clientId ?? null, payload.quoteId ?? null, payload.invoiceId ?? null]
  );
  return rows[0]?.allowed === true;
}

async function fetchOpportunity(agencyId, id) {
  const { rows } = await query(
    `SELECT
      o.*,
      p.id AS prospect_id,
      c.id AS client_id,
      p.name AS prospect_name,
      p.company AS prospect_company,
      c.name AS client_name,
      c.company AS client_company
     FROM opportunities o
     LEFT JOIN prospects p ON p.id = o.prospect_id AND p.agency_id = o.agency_id
     LEFT JOIN clients c ON c.id = o.client_id AND c.agency_id = o.agency_id
     WHERE o.id = $1 AND o.agency_id = $2`,
    [id, agencyId]
  );
  return rows[0] ? mapOpportunity(rows[0]) : null;
}

router.get("/summary", async (req, res, next) => {
  try {
    const [prospects, opportunities] = await Promise.all([
      query(
        `SELECT status, COUNT(*)::INT AS count
         FROM prospects
         WHERE agency_id = $1
         GROUP BY status`,
        [req.user.agencyId]
      ),
      query(
        `SELECT
          stage,
          COUNT(*)::INT AS count,
          COALESCE(SUM(value), 0)::NUMERIC AS value,
          COALESCE(SUM(value * probability / 100), 0)::NUMERIC AS weighted
         FROM opportunities
         WHERE agency_id = $1
         GROUP BY stage`,
        [req.user.agencyId]
      )
    ]);

    return res.json({
      prospects: prospects.rows.map((row) => ({
        status: row.status,
        count: Number(row.count || 0)
      })),
      opportunities: opportunities.rows.map((row) => ({
        stage: row.stage,
        count: Number(row.count || 0),
        value: Number(row.value || 0),
        weightedValue: Number(row.weighted || 0)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/prospects", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT *
       FROM prospects
       WHERE agency_id = $1
       ORDER BY created_at DESC`,
      [req.user.agencyId]
    );
    return res.json(rows.map(mapProspect));
  } catch (error) {
    return next(error);
  }
});

router.post("/prospects", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const parsed = prospectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed.", issues: parsed.error.flatten() });
    }
    const p = parsed.data;
    const { rows } = await query(
      `INSERT INTO prospects (
        agency_id, created_by, name, company, email, phone, source, status, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        req.user.agencyId,
        req.user.id,
        p.name.trim(),
        p.company?.trim() || null,
        p.email?.trim().toLowerCase() || null,
        p.phone?.trim() || null,
        p.source?.trim() || null,
        p.status,
        p.notes?.trim() || null
      ]
    );
    return res.status(201).json(mapProspect(rows[0]));
  } catch (error) {
    return next(error);
  }
});

router.put("/prospects/:id", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid prospect id." });
    const parsed = prospectSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed.", issues: parsed.error.flatten() });
    }
    const p = parsed.data;
    const { rows } = await query(
      `UPDATE prospects
       SET name = $1,
           company = $2,
           email = $3,
           phone = $4,
           source = $5,
           status = $6,
           notes = $7
       WHERE id = $8 AND agency_id = $9
       RETURNING *`,
      [
        p.name.trim(),
        p.company?.trim() || null,
        p.email?.trim().toLowerCase() || null,
        p.phone?.trim() || null,
        p.source?.trim() || null,
        p.status,
        p.notes?.trim() || null,
        id,
        req.user.agencyId
      ]
    );
    if (!rows[0]) return res.status(404).json({ message: "Prospect not found." });
    return res.json(mapProspect(rows[0]));
  } catch (error) {
    return next(error);
  }
});

router.post("/prospects/:id/convert-to-client", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid prospect id." });

    let clientId;
    await withTransaction(async (client) => {
      const prospectRes = await client.query(
        `SELECT *
         FROM prospects
         WHERE id = $1 AND agency_id = $2
         FOR UPDATE`,
        [id, req.user.agencyId]
      );
      const prospect = prospectRes.rows[0];
      if (!prospect) {
        const error = new Error("Prospect not found.");
        error.status = 404;
        throw error;
      }

      if (prospect.converted_client_id) {
        const existing = await client.query(
          "SELECT id FROM clients WHERE id = $1 AND agency_id = $2",
          [prospect.converted_client_id, req.user.agencyId]
        );
        if (!existing.rows[0]) {
          const error = new Error("Converted client not found.");
          error.status = 409;
          throw error;
        }
        clientId = existing.rows[0].id;
        return;
      }

      const created = await client.query(
        `INSERT INTO clients (agency_id, created_by, name, company, email, phone)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [
          req.user.agencyId,
          req.user.id,
          prospect.name,
          prospect.company,
          prospect.email || `prospect-${prospect.id}@example.local`,
          prospect.phone
        ]
      );
      clientId = created.rows[0].id;
      await client.query(
        `UPDATE prospects
         SET status = 'converted', converted_client_id = $1
         WHERE id = $2`,
        [clientId, id]
      );
    });

    return res.status(201).json({ clientId });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

router.delete("/prospects/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid prospect id." });
    const result = await query(
      "DELETE FROM prospects WHERE id = $1 AND agency_id = $2 RETURNING id",
      [id, req.user.agencyId]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Prospect not found." });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

router.get("/opportunities", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        o.*,
      p.id AS prospect_id,
      c.id AS client_id,
        p.name AS prospect_name,
        p.company AS prospect_company,
        c.name AS client_name,
        c.company AS client_company
       FROM opportunities o
       LEFT JOIN prospects p ON p.id = o.prospect_id AND p.agency_id = o.agency_id
       LEFT JOIN clients c ON c.id = o.client_id AND c.agency_id = o.agency_id
       WHERE o.agency_id = $1
       ORDER BY o.created_at DESC`,
      [req.user.agencyId]
    );
    return res.json(rows.map(mapOpportunity));
  } catch (error) {
    return next(error);
  }
});

router.post("/opportunities", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const parsed = opportunitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed.", issues: parsed.error.flatten() });
    }
    const p = parsed.data;
    if (!(await ownsOpportunityReferences(req.user.agencyId, p))) {
      return res.status(404).json({ message: "Related record not found." });
    }
    const { rows } = await query(
      `INSERT INTO opportunities (
        agency_id, created_by, prospect_id, client_id, quote_id, invoice_id,
        title, stage, value, probability, expected_close_date, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        req.user.agencyId,
        req.user.id,
        p.prospectId || null,
        p.clientId || null,
        p.quoteId || null,
        p.invoiceId || null,
        p.title.trim(),
        p.stage,
        p.value,
        p.probability,
        p.expectedCloseDate || null,
        p.notes?.trim() || null
      ]
    );
    const opportunity = await fetchOpportunity(req.user.agencyId, rows[0].id);
    return res.status(201).json(opportunity);
  } catch (error) {
    return next(error);
  }
});

router.put("/opportunities/:id", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid opportunity id." });
    const parsed = opportunitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Validation failed.", issues: parsed.error.flatten() });
    }
    const p = parsed.data;
    if (!(await ownsOpportunityReferences(req.user.agencyId, p))) {
      return res.status(404).json({ message: "Related record not found." });
    }
    const { rows } = await query(
      `UPDATE opportunities
       SET prospect_id = $1,
           client_id = $2,
           quote_id = $3,
           invoice_id = $4,
           title = $5,
           stage = $6,
           value = $7,
           probability = $8,
           expected_close_date = $9,
           notes = $10
       WHERE id = $11 AND agency_id = $12
       RETURNING id`,
      [
        p.prospectId || null,
        p.clientId || null,
        p.quoteId || null,
        p.invoiceId || null,
        p.title.trim(),
        p.stage,
        p.value,
        p.probability,
        p.expectedCloseDate || null,
        p.notes?.trim() || null,
        id,
        req.user.agencyId
      ]
    );
    if (!rows[0]) return res.status(404).json({ message: "Opportunity not found." });
    const opportunity = await fetchOpportunity(req.user.agencyId, id);
    return res.json(opportunity);
  } catch (error) {
    return next(error);
  }
});

router.delete("/opportunities/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid opportunity id." });
    const result = await query(
      "DELETE FROM opportunities WHERE id = $1 AND agency_id = $2 RETURNING id",
      [id, req.user.agencyId]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Opportunity not found." });
    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
