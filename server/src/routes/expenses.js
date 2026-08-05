import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { generateExpenseNumber } from "../utils/docNumbers.js";

const router = Router();

router.use(requireAuth);

const expenseSchema = z.object({
  supplierId: z.number().int().positive().optional().nullable(),
  status: z.enum(["pending", "approved", "paid", "rejected"]).default("pending"),
  expenseDate: z.string().optional().nullable(),
  category: z.string().min(2, "Catégorie requise."),
  paymentMethod: z.string().optional().nullable(),
  amount: z.coerce.number().nonnegative(),
  taxRate: z.coerce.number().min(0).max(1).default(0),
  notes: z.string().optional().nullable(),
  receiptUrl: z.string().url().optional().nullable().or(z.literal(""))
});

const expenseStatusSchema = z.object({
  status: z.enum(["pending", "approved", "paid", "rejected"])
});

function parseId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function computeExpenseTotals(amount, taxRate) {
  const base = Number(amount || 0);
  const rate = Number(taxRate || 0);
  const taxAmount = Math.round((base * rate + Number.EPSILON) * 100) / 100;
  const total = Math.round((base + taxAmount + Number.EPSILON) * 100) / 100;
  return { amount: base, taxRate: rate, taxAmount, total };
}

function mapExpenseRow(row) {
  return {
    id: row.id,
    expenseNumber: row.expense_number,
    status: row.status,
    expenseDate: row.expense_date,
    category: row.category,
    paymentMethod: row.payment_method,
    amount: Number(row.amount || 0),
    taxRate: Number(row.tax_rate || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    notes: row.notes,
    receiptUrl: row.receipt_url,
    supplier: row.supplier_id
      ? {
          id: row.supplier_id,
          name: row.supplier_name,
          company: row.supplier_company
        }
      : null
  };
}

async function fetchExpenseById(agencyId, expenseId) {
  const { rows } = await query(
    `SELECT
      e.*,
      s.name AS supplier_name,
      s.company AS supplier_company
     FROM expenses e
     LEFT JOIN suppliers s ON s.id = e.supplier_id
     WHERE e.id = $1
       AND e.agency_id = $2`,
    [expenseId, agencyId]
  );
  return rows[0] ? mapExpenseRow(rows[0]) : null;
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        e.*,
        s.name AS supplier_name,
        s.company AS supplier_company
       FROM expenses e
       LEFT JOIN suppliers s ON s.id = e.supplier_id
       WHERE e.agency_id = $1
       ORDER BY e.created_at DESC`,
      [req.user.agencyId]
    );

    return res.json(rows.map(mapExpenseRow));
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID dépense invalide." });
    }

    const expense = await fetchExpenseById(req.user.agencyId, id);
    if (!expense) {
      return res.status(404).json({ message: "Dépense introuvable." });
    }
    return res.json(expense);
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const totals = computeExpenseTotals(payload.amount, payload.taxRate);
    let expenseId;

    await withTransaction(async (client) => {
      if (payload.supplierId) {
        const supplierRes = await client.query(
          "SELECT id FROM suppliers WHERE id = $1 AND agency_id = $2",
          [payload.supplierId, req.user.agencyId]
        );
        if (!supplierRes.rows[0]) {
          const error = new Error("Fournisseur introuvable.");
          error.status = 404;
          throw error;
        }
      }

      const expenseNumber = await generateExpenseNumber(client, req.user.agencyId);
      const insertRes = await client.query(
        `INSERT INTO expenses (
          agency_id,
          created_by,
          supplier_id,
          expense_number,
          status,
          expense_date,
          category,
          payment_method,
          amount,
          tax_rate,
          tax_amount,
          total,
          notes,
          receipt_url
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id`,
        [
          req.user.agencyId,
          req.user.id,
          payload.supplierId || null,
          expenseNumber,
          payload.status,
          payload.expenseDate || null,
          payload.category.trim(),
          payload.paymentMethod?.trim() || null,
          totals.amount,
          totals.taxRate,
          totals.taxAmount,
          totals.total,
          payload.notes?.trim() || null,
          payload.receiptUrl?.trim() || null
        ]
      );
      expenseId = insertRes.rows[0].id;
    });

    const expense = await fetchExpenseById(req.user.agencyId, expenseId);
    return res.status(201).json(expense);
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
      return res.status(400).json({ message: "ID dépense invalide." });
    }

    const parsed = expenseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const totals = computeExpenseTotals(payload.amount, payload.taxRate);

    await withTransaction(async (client) => {
      const expenseRes = await client.query(
        "SELECT id FROM expenses WHERE id = $1 AND agency_id = $2",
        [id, req.user.agencyId]
      );
      if (!expenseRes.rows[0]) {
        const error = new Error("Dépense introuvable.");
        error.status = 404;
        throw error;
      }

      if (payload.supplierId) {
        const supplierRes = await client.query(
          "SELECT id FROM suppliers WHERE id = $1 AND agency_id = $2",
          [payload.supplierId, req.user.agencyId]
        );
        if (!supplierRes.rows[0]) {
          const error = new Error("Fournisseur introuvable.");
          error.status = 404;
          throw error;
        }
      }

      await client.query(
        `UPDATE expenses
         SET supplier_id = $1,
             status = $2,
             expense_date = $3,
             category = $4,
             payment_method = $5,
             amount = $6,
             tax_rate = $7,
             tax_amount = $8,
             total = $9,
             notes = $10,
             receipt_url = $11
         WHERE id = $12
           AND agency_id = $13`,
        [
          payload.supplierId || null,
          payload.status,
          payload.expenseDate || null,
          payload.category.trim(),
          payload.paymentMethod?.trim() || null,
          totals.amount,
          totals.taxRate,
          totals.taxAmount,
          totals.total,
          payload.notes?.trim() || null,
          payload.receiptUrl?.trim() || null,
          id,
          req.user.agencyId
        ]
      );
    });

    const expense = await fetchExpenseById(req.user.agencyId, id);
    return res.json(expense);
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
      return res.status(400).json({ message: "ID dépense invalide." });
    }

    const parsed = expenseStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const updateRes = await query(
      `UPDATE expenses
       SET status = $1
       WHERE id = $2
         AND agency_id = $3
       RETURNING id`,
      [parsed.data.status, id, req.user.agencyId]
    );
    if (!updateRes.rows[0]) {
      return res.status(404).json({ message: "Dépense introuvable." });
    }

    const expense = await fetchExpenseById(req.user.agencyId, id);
    return res.json(expense);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID dépense invalide." });
    }

    const deleteRes = await query(
      "DELETE FROM expenses WHERE id = $1 AND agency_id = $2 RETURNING id",
      [id, req.user.agencyId]
    );
    if (!deleteRes.rows[0]) {
      return res.status(404).json({ message: "Dépense introuvable." });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
