import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

router.get("/summary", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
         (SELECT COUNT(*) FROM quotes WHERE agency_id = $1)::INT AS total_quotes,
         (SELECT COUNT(*) FROM invoices WHERE agency_id = $1)::INT AS total_invoices,
         (SELECT COALESCE(SUM(total), 0) FROM invoices WHERE agency_id = $1 AND status = 'paid')::NUMERIC(12, 2) AS revenue_generated,
         (SELECT COUNT(*) FROM clients WHERE agency_id = $1)::INT AS active_clients,
         (SELECT COUNT(*) FROM users WHERE agency_id = $1 AND is_active = true)::INT AS active_team_members`,
      [req.user.agencyId]
    );

    const summary = rows[0];
    return res.json({
      totalQuotes: Number(summary.total_quotes || 0),
      totalInvoices: Number(summary.total_invoices || 0),
      revenueGenerated: Number(summary.revenue_generated || 0),
      activeClients: Number(summary.active_clients || 0),
      activeTeamMembers: Number(summary.active_team_members || 0)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/charts", async (req, res, next) => {
  try {
    const days = Number(req.query.days || 30);
    const safeDays = Number.isFinite(days) ? Math.min(Math.max(days, 7), 90) : 30;

    const { rows } = await query(
      `WITH day_series AS (
        SELECT generate_series(
          CURRENT_DATE - ($2::INT - 1) * INTERVAL '1 day',
          CURRENT_DATE,
          INTERVAL '1 day'
        )::DATE AS day
      ),
      revenue_by_day AS (
        SELECT issue_date::DATE AS day, SUM(total)::NUMERIC(12, 2) AS amount
        FROM invoices
        WHERE agency_id = $1
          AND status = 'paid'
          AND issue_date >= CURRENT_DATE - ($2::INT - 1) * INTERVAL '1 day'
        GROUP BY issue_date::DATE
      ),
      quotes_by_day AS (
        SELECT issue_date::DATE AS day, COUNT(*)::INT AS amount
        FROM quotes
        WHERE agency_id = $1
          AND issue_date >= CURRENT_DATE - ($2::INT - 1) * INTERVAL '1 day'
        GROUP BY issue_date::DATE
      )
      SELECT
        ds.day::TEXT AS day,
        COALESCE(rbd.amount, 0)::NUMERIC(12, 2) AS revenue,
        COALESCE(qbd.amount, 0)::INT AS quotes
      FROM day_series ds
      LEFT JOIN revenue_by_day rbd ON rbd.day = ds.day
      LEFT JOIN quotes_by_day qbd ON qbd.day = ds.day
      ORDER BY ds.day ASC`,
      [req.user.agencyId, safeDays]
    );

    return res.json({
      labels: rows.map((row) => row.day),
      revenueSeries: rows.map((row) => Number(row.revenue || 0)),
      quoteSeries: rows.map((row) => Number(row.quotes || 0))
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/recent-quotes", async (req, res, next) => {
  try {
    const limitRaw = Number(req.query.limit || 6);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 6;

    const { rows } = await query(
      `SELECT
         q.id,
         q.quote_number,
         q.status,
         q.issue_date,
         q.total,
         c.name AS client_name,
         c.company AS client_company
       FROM quotes q
       INNER JOIN clients c ON c.id = q.client_id
       WHERE q.agency_id = $1
       ORDER BY q.created_at DESC
       LIMIT $2`,
      [req.user.agencyId, limit]
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        quoteNumber: row.quote_number,
        status: row.status,
        issueDate: row.issue_date,
        total: Number(row.total || 0),
        clientName: row.client_name,
        clientCompany: row.client_company
      }))
    );
  } catch (error) {
    return next(error);
  }
});

export default router;
