import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildAccountingExportPdf } from "../services/pdf.js";

const router = Router();

router.use(requireAuth);

function parseDate(value) {
  if (!value) {
    return null;
  }
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return null;
  }
  return asDate.toISOString().slice(0, 10);
}

function resolveLedgerFilters(req) {
  const fromDate = parseDate(req.query.from);
  const toDate = parseDate(req.query.to);
  const type = String(req.query.type || "").trim().toLowerCase();
  const validTypes = new Set(["invoice", "purchase", "expense"]);
  const entryType = validTypes.has(type) ? type : null;
  return { fromDate, toDate, entryType };
}

function parseMonth(value) {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}$/.test(raw)) {
    return new Date().toISOString().slice(0, 7);
  }
  return raw;
}

function buildWhereSql({ fromDate, toDate, entryType }) {
  const params = [];
  const clauses = [];

  if (fromDate) {
    params.push(fromDate);
    clauses.push(`entry_date >= $${params.length + 1}`);
  }

  if (toDate) {
    params.push(toDate);
    clauses.push(`entry_date <= $${params.length + 1}`);
  }

  if (entryType) {
    params.push(entryType);
    clauses.push(`entry_type = $${params.length + 1}`);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params
  };
}

async function fetchLedgerEntries({ agencyId, filters, limit = 400 }) {
  const safeLimit = Number.isFinite(Number(limit))
    ? Math.min(Math.max(Number(limit), 1), 5000)
    : 400;

  const { whereSql, params: whereParams } = buildWhereSql(filters);
  const params = [agencyId, ...whereParams, safeLimit];

  const { rows } = await query(
    `WITH ledger_base AS (
      SELECT
        'invoice'::TEXT AS entry_type,
        i.id AS source_id,
        i.issue_date AS entry_date,
        i.invoice_number AS reference_number,
        c.name AS counterpart_name,
        'credit'::TEXT AS direction,
        i.total::NUMERIC(12, 2) AS amount,
        'Revenu client'::TEXT AS category
      FROM invoices i
      INNER JOIN clients c ON c.id = i.client_id
      WHERE i.agency_id = $1
        AND i.status = 'paid'

      UNION ALL

      SELECT
        'purchase'::TEXT AS entry_type,
        p.id AS source_id,
        COALESCE(p.due_date, p.issue_date) AS entry_date,
        p.purchase_number AS reference_number,
        s.name AS counterpart_name,
        'debit'::TEXT AS direction,
        p.total::NUMERIC(12, 2) AS amount,
        'Achat fournisseur'::TEXT AS category
      FROM purchases p
      INNER JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.agency_id = $1
        AND p.status = 'paid'

      UNION ALL

      SELECT
        'expense'::TEXT AS entry_type,
        e.id AS source_id,
        e.expense_date AS entry_date,
        e.expense_number AS reference_number,
        COALESCE(s.name, e.category) AS counterpart_name,
        'debit'::TEXT AS direction,
        e.total::NUMERIC(12, 2) AS amount,
        e.category::TEXT AS category
      FROM expenses e
      LEFT JOIN suppliers s ON s.id = e.supplier_id
      WHERE e.agency_id = $1
        AND e.status IN ('approved', 'paid')
    )
    SELECT
      entry_type,
      source_id,
      entry_date,
      reference_number,
      counterpart_name,
      direction,
      amount,
      category
    FROM ledger_base
    ${whereSql}
    ORDER BY entry_date DESC, reference_number DESC
    LIMIT $${params.length}`,
    params
  );

  return rows.map((row) => ({
    entryType: row.entry_type,
    sourceId: row.source_id,
    entryDate: row.entry_date,
    referenceNumber: row.reference_number,
    counterpartName: row.counterpart_name,
    direction: row.direction,
    amount: Number(row.amount || 0),
    category: row.category
  }));
}

function escapeCsvCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const asString = String(value);
  if (!/[",\n\r]/.test(asString)) {
    return asString;
  }
  return `"${asString.replace(/"/g, "\"\"")}"`;
}

router.get("/overview", async (req, res, next) => {
  try {
    const [revenueRes, purchasesPaidRes, expensesRes, payableRes] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(total), 0)::NUMERIC(12, 2) AS value
         FROM invoices
         WHERE agency_id = $1
           AND status = 'paid'`,
        [req.user.agencyId]
      ),
      query(
        `SELECT COALESCE(SUM(total), 0)::NUMERIC(12, 2) AS value
         FROM purchases
         WHERE agency_id = $1
           AND status = 'paid'`,
        [req.user.agencyId]
      ),
      query(
        `SELECT COALESCE(SUM(total), 0)::NUMERIC(12, 2) AS value
         FROM expenses
         WHERE agency_id = $1
           AND status IN ('approved', 'paid')`,
        [req.user.agencyId]
      ),
      query(
        `SELECT COALESCE(SUM(total), 0)::NUMERIC(12, 2) AS value
         FROM purchases
         WHERE agency_id = $1
           AND status IN ('ordered', 'received')`,
        [req.user.agencyId]
      )
    ]);

    const revenue = Number(revenueRes.rows[0]?.value || 0);
    const purchasesPaid = Number(purchasesPaidRes.rows[0]?.value || 0);
    const expenses = Number(expensesRes.rows[0]?.value || 0);
    const pendingPayables = Number(payableRes.rows[0]?.value || 0);

    return res.json({
      revenue,
      purchasesPaid,
      expenses,
      pendingPayables,
      netCashflow: revenue - purchasesPaid - expenses
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/entries", async (req, res, next) => {
  try {
    const filters = resolveLedgerFilters(req);
    const entries = await fetchLedgerEntries({
      agencyId: req.user.agencyId,
      filters,
      limit: 400
    });
    return res.json(entries);
  } catch (error) {
    return next(error);
  }
});

router.get("/cashflow-forecast", async (req, res, next) => {
  try {
    const [invoicesRes, overdueRes, purchasesRes, expensesRes, seriesRes] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(total), 0)::NUMERIC(12, 2) AS value
         FROM invoices
         WHERE agency_id = $1
           AND status = 'pending'
           AND COALESCE(due_date, issue_date) <= CURRENT_DATE + INTERVAL '60 days'`,
        [req.user.agencyId]
      ),
      query(
        `SELECT COALESCE(SUM(total), 0)::NUMERIC(12, 2) AS value
         FROM invoices
         WHERE agency_id = $1
           AND status = 'pending'
           AND due_date < CURRENT_DATE`,
        [req.user.agencyId]
      ),
      query(
        `SELECT COALESCE(SUM(total), 0)::NUMERIC(12, 2) AS value
         FROM purchases
         WHERE agency_id = $1
           AND status IN ('ordered', 'received')
           AND COALESCE(due_date, issue_date) <= CURRENT_DATE + INTERVAL '60 days'`,
        [req.user.agencyId]
      ),
      query(
        `SELECT COALESCE(SUM(total), 0)::NUMERIC(12, 2) AS value
         FROM expenses
         WHERE agency_id = $1
           AND status IN ('pending', 'approved')
           AND expense_date <= CURRENT_DATE + INTERVAL '60 days'`,
        [req.user.agencyId]
      ),
      query(
        `WITH events AS (
          SELECT
            date_trunc('week', COALESCE(due_date, issue_date))::DATE AS week,
            total::NUMERIC AS inflow,
            0::NUMERIC AS outflow
          FROM invoices
          WHERE agency_id = $1
            AND status = 'pending'
            AND COALESCE(due_date, issue_date) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'

          UNION ALL

          SELECT
            date_trunc('week', COALESCE(due_date, issue_date))::DATE AS week,
            0::NUMERIC AS inflow,
            total::NUMERIC AS outflow
          FROM purchases
          WHERE agency_id = $1
            AND status IN ('ordered', 'received')
            AND COALESCE(due_date, issue_date) BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'

          UNION ALL

          SELECT
            date_trunc('week', expense_date)::DATE AS week,
            0::NUMERIC AS inflow,
            total::NUMERIC AS outflow
          FROM expenses
          WHERE agency_id = $1
            AND status IN ('pending', 'approved')
            AND expense_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '60 days'
        )
        SELECT
          week::TEXT,
          COALESCE(SUM(inflow), 0)::NUMERIC(12, 2) AS inflow,
          COALESCE(SUM(outflow), 0)::NUMERIC(12, 2) AS outflow
        FROM events
        GROUP BY week
        ORDER BY week ASC`,
        [req.user.agencyId]
      )
    ]);

    const expectedInflow = Number(invoicesRes.rows[0]?.value || 0);
    const overdueInflow = Number(overdueRes.rows[0]?.value || 0);
    const expectedPurchases = Number(purchasesRes.rows[0]?.value || 0);
    const expectedExpenses = Number(expensesRes.rows[0]?.value || 0);
    const expectedOutflow = expectedPurchases + expectedExpenses;

    return res.json({
      expectedInflow,
      overdueInflow,
      expectedPurchases,
      expectedExpenses,
      expectedOutflow,
      projectedNet: expectedInflow - expectedOutflow,
      series: seriesRes.rows.map((row) => ({
        week: row.week,
        inflow: Number(row.inflow || 0),
        outflow: Number(row.outflow || 0),
        net: Number(row.inflow || 0) - Number(row.outflow || 0)
      }))
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/export.csv", async (req, res, next) => {
  try {
    const filters = resolveLedgerFilters(req);
    const entries = await fetchLedgerEntries({
      agencyId: req.user.agencyId,
      filters,
      limit: 3000
    });

    const rows = [
      ["Date", "Type", "Référence", "Contrepartie", "Catégorie", "Direction", "Montant"],
      ...entries.map((entry) => [
        entry.entryDate ? new Date(entry.entryDate).toISOString().slice(0, 10) : "",
        entry.entryType,
        entry.referenceNumber,
        entry.counterpartName,
        entry.category,
        entry.direction,
        entry.amount.toFixed(2)
      ])
    ];

    const csv = rows
      .map((line) => line.map((cell) => escapeCsvCell(cell)).join(","))
      .join("\n");

    const filename = `grand-livre-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return next(error);
  }
});

router.get("/monthly-export.csv", async (req, res, next) => {
  try {
    const month = parseMonth(req.query.month);
    const filters = {
      fromDate: `${month}-01`,
      toDate: new Date(`${month}-01T00:00:00.000Z`).toISOString().slice(0, 10),
      entryType: null
    };
    const end = new Date(`${month}-01T00:00:00.000Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
    filters.toDate = end.toISOString().slice(0, 10);

    const entries = await fetchLedgerEntries({ agencyId: req.user.agencyId, filters, limit: 5000 });
    const rows = [
      ["Date", "Type", "Reference", "Contrepartie", "Categorie", "Direction", "Montant"],
      ...entries.map((entry) => [
        entry.entryDate ? new Date(entry.entryDate).toISOString().slice(0, 10) : "",
        entry.entryType,
        entry.referenceNumber,
        entry.counterpartName,
        entry.category,
        entry.direction,
        entry.amount.toFixed(2)
      ])
    ];

    const csv = rows.map((line) => line.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="export-comptable-${month}.csv"`);
    return res.send(`\uFEFF${csv}`);
  } catch (error) {
    return next(error);
  }
});

router.get("/monthly-export.pdf", async (req, res, next) => {
  try {
    const month = parseMonth(req.query.month);
    const start = `${month}-01`;
    const end = new Date(`${month}-01T00:00:00.000Z`);
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(end.getUTCDate() - 1);

    const entries = await fetchLedgerEntries({
      agencyId: req.user.agencyId,
      filters: {
        fromDate: start,
        toDate: end.toISOString().slice(0, 10),
        entryType: null
      },
      limit: 5000
    });
    const settingsRes = await query(
      "SELECT agency_name, currency FROM agency_settings WHERE agency_id = $1",
      [req.user.agencyId]
    );
    const buffer = await buildAccountingExportPdf({
      month,
      entries,
      settings: settingsRes.rows[0] || null
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="export-comptable-${month}.pdf"`);
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

export default router;
