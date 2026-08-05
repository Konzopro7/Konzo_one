import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { normalizeItems, computeTotals } from "../utils/calculations.js";
import { generatePurchaseNumber } from "../utils/docNumbers.js";
import { buildBusinessPdf } from "../services/pdf.js";

const router = Router();

router.use(requireAuth);

const purchaseSchema = z.object({
  supplierId: z.number().int().positive(),
  status: z.enum(["draft", "ordered", "received", "paid", "cancelled"]).default("draft"),
  dueDate: z.string().optional().nullable(),
  paymentMethod: z.string().optional().nullable(),
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

const purchaseStatusSchema = z.object({
  status: z.enum(["draft", "ordered", "received", "paid", "cancelled"])
});

function parseId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function mapPurchaseRow(row) {
  return {
    id: row.id,
    purchaseNumber: row.purchase_number,
    status: row.status,
    issueDate: row.issue_date,
    dueDate: row.due_date,
    paymentMethod: row.payment_method,
    subtotal: Number(row.subtotal || 0),
    taxRate: Number(row.tax_rate || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total || 0),
    notes: row.notes,
    supplier: {
      id: row.supplier_id,
      name: row.supplier_name,
      company: row.supplier_company,
      email: row.supplier_email,
      phone: row.supplier_phone
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

async function fetchPurchaseById(agencyId, purchaseId) {
  const { rows } = await query(
    `SELECT
      p.*,
      s.name AS supplier_name,
      s.company AS supplier_company,
      s.email AS supplier_email,
      s.phone AS supplier_phone
    FROM purchases p
    INNER JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.id = $1
      AND p.agency_id = $2`,
    [purchaseId, agencyId]
  );

  if (!rows[0]) {
    return null;
  }

  const itemsRes = await query(
    `SELECT id, description, unit_price, quantity, line_total
     FROM purchase_items
     WHERE purchase_id = $1
     ORDER BY id ASC`,
    [purchaseId]
  );

  return {
    ...mapPurchaseRow(rows[0]),
    items: itemsRes.rows.map(mapItemRow)
  };
}

async function fetchSettings(agencyId) {
  const { rows } = await query(
    `SELECT agency_name, agency_email, agency_phone, payment_terms, currency, logo_url
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
        p.id,
        p.purchase_number,
        p.status,
        p.issue_date,
        p.due_date,
        p.total,
        p.payment_method,
        s.id AS supplier_id,
        s.name AS supplier_name,
        s.company AS supplier_company
      FROM purchases p
      INNER JOIN suppliers s ON s.id = p.supplier_id
      WHERE p.agency_id = $1
      ORDER BY p.created_at DESC`,
      [req.user.agencyId]
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        purchaseNumber: row.purchase_number,
        status: row.status,
        issueDate: row.issue_date,
        dueDate: row.due_date,
        total: Number(row.total || 0),
        paymentMethod: row.payment_method,
        supplier: {
          id: row.supplier_id,
          name: row.supplier_name,
          company: row.supplier_company
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
      return res.status(400).json({ message: "ID achat invalide." });
    }

    const purchase = await fetchPurchaseById(req.user.agencyId, id);
    if (!purchase) {
      return res.status(404).json({ message: "Achat introuvable." });
    }

    return res.json(purchase);
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const normalizedItems = normalizeItems(payload.items);
    if (!normalizedItems.length) {
      return res.status(400).json({ message: "Ajoute au moins une ligne d'achat." });
    }

    const totals = computeTotals(normalizedItems, payload.taxRate);
    let purchaseId;

    await withTransaction(async (client) => {
      const supplierRes = await client.query(
        "SELECT id FROM suppliers WHERE id = $1 AND agency_id = $2",
        [payload.supplierId, req.user.agencyId]
      );
      if (!supplierRes.rows[0]) {
        const error = new Error("Fournisseur introuvable.");
        error.status = 404;
        throw error;
      }

      const purchaseNumber = await generatePurchaseNumber(client, req.user.agencyId);
      const createRes = await client.query(
        `INSERT INTO purchases (
          agency_id,
          created_by,
          supplier_id,
          purchase_number,
          status,
          due_date,
          payment_method,
          subtotal,
          tax_rate,
          tax_amount,
          total,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          req.user.agencyId,
          req.user.id,
          payload.supplierId,
          purchaseNumber,
          payload.status,
          payload.dueDate || null,
          payload.paymentMethod?.trim() || null,
          totals.subtotal,
          totals.taxRate,
          totals.taxAmount,
          totals.total,
          payload.notes?.trim() || null
        ]
      );
      purchaseId = createRes.rows[0].id;

      for (const item of totals.items) {
        await client.query(
          `INSERT INTO purchase_items (purchase_id, description, unit_price, quantity, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [purchaseId, item.description, item.unitPrice, item.quantity, item.lineTotal]
        );
      }
    });

    const purchase = await fetchPurchaseById(req.user.agencyId, purchaseId);
    return res.status(201).json(purchase);
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
      return res.status(400).json({ message: "ID achat invalide." });
    }

    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const normalizedItems = normalizeItems(payload.items);
    if (!normalizedItems.length) {
      return res.status(400).json({ message: "Ajoute au moins une ligne d'achat." });
    }

    const totals = computeTotals(normalizedItems, payload.taxRate);

    await withTransaction(async (client) => {
      const purchaseRes = await client.query(
        "SELECT id FROM purchases WHERE id = $1 AND agency_id = $2",
        [id, req.user.agencyId]
      );
      if (!purchaseRes.rows[0]) {
        const error = new Error("Achat introuvable.");
        error.status = 404;
        throw error;
      }

      const supplierRes = await client.query(
        "SELECT id FROM suppliers WHERE id = $1 AND agency_id = $2",
        [payload.supplierId, req.user.agencyId]
      );
      if (!supplierRes.rows[0]) {
        const error = new Error("Fournisseur introuvable.");
        error.status = 404;
        throw error;
      }

      await client.query(
        `UPDATE purchases
         SET supplier_id = $1,
             status = $2,
             due_date = $3,
             payment_method = $4,
             subtotal = $5,
             tax_rate = $6,
             tax_amount = $7,
             total = $8,
             notes = $9
         WHERE id = $10
           AND agency_id = $11`,
        [
          payload.supplierId,
          payload.status,
          payload.dueDate || null,
          payload.paymentMethod?.trim() || null,
          totals.subtotal,
          totals.taxRate,
          totals.taxAmount,
          totals.total,
          payload.notes?.trim() || null,
          id,
          req.user.agencyId
        ]
      );

      await client.query("DELETE FROM purchase_items WHERE purchase_id = $1", [id]);
      for (const item of totals.items) {
        await client.query(
          `INSERT INTO purchase_items (purchase_id, description, unit_price, quantity, line_total)
           VALUES ($1, $2, $3, $4, $5)`,
          [id, item.description, item.unitPrice, item.quantity, item.lineTotal]
        );
      }
    });

    const purchase = await fetchPurchaseById(req.user.agencyId, id);
    return res.json(purchase);
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
      return res.status(400).json({ message: "ID achat invalide." });
    }

    const parsed = purchaseStatusSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const updateRes = await query(
      `UPDATE purchases
       SET status = $1
       WHERE id = $2
         AND agency_id = $3
       RETURNING id`,
      [parsed.data.status, id, req.user.agencyId]
    );

    if (!updateRes.rows[0]) {
      return res.status(404).json({ message: "Achat introuvable." });
    }

    const purchase = await fetchPurchaseById(req.user.agencyId, id);
    return res.json(purchase);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID achat invalide." });
    }

    const purchase = await fetchPurchaseById(req.user.agencyId, id);
    if (!purchase) {
      return res.status(404).json({ message: "Achat introuvable." });
    }

    const settings = await fetchSettings(req.user.agencyId);
    const buffer = await buildBusinessPdf({
      documentType: "purchase",
      data: {
        number: purchase.purchaseNumber,
        issueDate: purchase.issueDate,
        dueDate: purchase.dueDate,
        subtotal: purchase.subtotal,
        taxAmount: purchase.taxAmount,
        total: purchase.total
      },
      items: purchase.items,
      client: purchase.supplier,
      settings
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"${purchase.purchaseNumber}.pdf\"`
    );
    return res.send(buffer);
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID achat invalide." });
    }

    const deleteRes = await query(
      "DELETE FROM purchases WHERE id = $1 AND agency_id = $2 RETURNING id",
      [id, req.user.agencyId]
    );
    if (!deleteRes.rows[0]) {
      return res.status(404).json({ message: "Achat introuvable." });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
