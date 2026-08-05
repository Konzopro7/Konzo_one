import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.use(requireAuth);

const supplierSchema = z.object({
  name: z.string().min(2, "Le nom du fournisseur est requis."),
  company: z.string().optional().nullable(),
  email: z.string().email("Email invalide.").optional().nullable().or(z.literal("")),
  phone: z.string().optional().nullable()
});

function parseId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        s.id,
        s.name,
        s.company,
        s.email,
        s.phone,
        s.created_at,
        COUNT(DISTINCT p.id)::INT AS purchases_count,
        COUNT(DISTINCT e.id)::INT AS expenses_count
      FROM suppliers s
      LEFT JOIN purchases p ON p.supplier_id = s.id
      LEFT JOIN expenses e ON e.supplier_id = s.id
      WHERE s.agency_id = $1
      GROUP BY s.id
      ORDER BY s.created_at DESC`,
      [req.user.agencyId]
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        company: row.company,
        email: row.email,
        phone: row.phone,
        purchasesCount: Number(row.purchases_count || 0),
        expensesCount: Number(row.expenses_count || 0),
        createdAt: row.created_at
      }))
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const parsed = supplierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const { rows } = await query(
      `INSERT INTO suppliers (agency_id, created_by, name, company, email, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, company, email, phone, created_at`,
      [
        req.user.agencyId,
        req.user.id,
        payload.name.trim(),
        payload.company?.trim() || null,
        payload.email?.trim().toLowerCase() || null,
        payload.phone?.trim() || null
      ]
    );

    const supplier = rows[0];
    return res.status(201).json({
      id: supplier.id,
      name: supplier.name,
      company: supplier.company,
      email: supplier.email,
      phone: supplier.phone,
      createdAt: supplier.created_at
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID fournisseur invalide." });
    }

    const parsed = supplierSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const { rows } = await query(
      `UPDATE suppliers
       SET name = $1,
           company = $2,
           email = $3,
           phone = $4
       WHERE id = $5
         AND agency_id = $6
       RETURNING id, name, company, email, phone, updated_at`,
      [
        payload.name.trim(),
        payload.company?.trim() || null,
        payload.email?.trim().toLowerCase() || null,
        payload.phone?.trim() || null,
        id,
        req.user.agencyId
      ]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "Fournisseur introuvable." });
    }

    const supplier = rows[0];
    return res.json({
      id: supplier.id,
      name: supplier.name,
      company: supplier.company,
      email: supplier.email,
      phone: supplier.phone,
      updatedAt: supplier.updated_at
    });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID fournisseur invalide." });
    }

    const linked = await query(
      `SELECT
         (SELECT COUNT(*) FROM purchases WHERE agency_id = $1 AND supplier_id = $2)::INT AS purchases_count,
         (SELECT COUNT(*) FROM expenses WHERE agency_id = $1 AND supplier_id = $2)::INT AS expenses_count`,
      [req.user.agencyId, id]
    );

    if (
      Number(linked.rows[0]?.purchases_count || 0) > 0 ||
      Number(linked.rows[0]?.expenses_count || 0) > 0
    ) {
      return res.status(409).json({
        message: "Ce fournisseur est lié à des achats ou dépenses."
      });
    }

    const result = await query(
      "DELETE FROM suppliers WHERE id = $1 AND agency_id = $2 RETURNING id",
      [id, req.user.agencyId]
    );
    if (!result.rows[0]) {
      return res.status(404).json({ message: "Fournisseur introuvable." });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
