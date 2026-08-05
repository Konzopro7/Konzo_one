import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.use(requireAuth);

const inventoryItemSchema = z.object({
  sku: z.string().min(2, "SKU requis."),
  name: z.string().min(2, "Nom article requis."),
  category: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  costPrice: z.coerce.number().nonnegative().default(0),
  salePrice: z.coerce.number().nonnegative().default(0),
  stockQuantity: z.coerce.number().nonnegative().default(0),
  minStockAlert: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional().nullable()
});

const stockAdjustmentSchema = z.object({
  direction: z.enum(["in", "out"]),
  quantity: z.coerce.number().positive(),
  reason: z.string().optional().nullable(),
  unitCost: z.coerce.number().nonnegative().optional().nullable()
});

function parseId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOptionalText(value) {
  const next = value?.trim();
  return next ? next : null;
}

function mapItemRow(row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    unit: row.unit,
    costPrice: Number(row.cost_price || 0),
    salePrice: Number(row.sale_price || 0),
    stockQuantity: Number(row.stock_quantity || 0),
    minStockAlert: Number(row.min_stock_alert || 0),
    notes: row.notes,
    lastMovementAt: row.last_movement_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMovementRow(row) {
  return {
    id: row.id,
    inventoryItemId: row.inventory_item_id,
    movementType: row.movement_type,
    quantity: Number(row.quantity || 0),
    unitCost: row.unit_cost === null ? null : Number(row.unit_cost),
    reason: row.reason,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    createdAt: row.created_at,
    item: {
      id: row.inventory_item_id,
      sku: row.item_sku,
      name: row.item_name
    }
  };
}

async function fetchInventoryItemById(agencyId, itemId) {
  const { rows } = await query(
    `SELECT
      i.*,
      (
        SELECT sm.created_at
        FROM stock_movements sm
        WHERE sm.inventory_item_id = i.id
        ORDER BY sm.created_at DESC
        LIMIT 1
      ) AS last_movement_at
     FROM inventory_items i
     WHERE i.id = $1
       AND i.agency_id = $2`,
    [itemId, agencyId]
  );
  return rows[0] ? mapItemRow(rows[0]) : null;
}

async function fetchStockMovements({ agencyId, itemId = null, limit = 80 }) {
  const safeLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Number(limit), 1), 500)
    : 80;

  const params = [agencyId];
  const where = ["sm.agency_id = $1"];

  if (itemId) {
    params.push(itemId);
    where.push(`sm.inventory_item_id = $${params.length}`);
  }

  params.push(safeLimit);

  const { rows } = await query(
    `SELECT
      sm.id,
      sm.inventory_item_id,
      sm.movement_type,
      sm.quantity,
      sm.unit_cost,
      sm.reason,
      sm.reference_type,
      sm.reference_id,
      sm.created_at,
      i.sku AS item_sku,
      i.name AS item_name
     FROM stock_movements sm
     INNER JOIN inventory_items i ON i.id = sm.inventory_item_id
     WHERE ${where.join(" AND ")}
     ORDER BY sm.created_at DESC
     LIMIT $${params.length}`,
    params
  );

  return rows.map(mapMovementRow);
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        i.*,
        (
          SELECT sm.created_at
          FROM stock_movements sm
          WHERE sm.inventory_item_id = i.id
          ORDER BY sm.created_at DESC
          LIMIT 1
        ) AS last_movement_at
       FROM inventory_items i
       WHERE i.agency_id = $1
       ORDER BY i.created_at DESC`,
      [req.user.agencyId]
    );

    return res.json(rows.map(mapItemRow));
  } catch (error) {
    return next(error);
  }
});

router.get("/movements", async (req, res, next) => {
  try {
    const itemId = req.query.itemId ? parseId(req.query.itemId) : null;
    if (req.query.itemId && !itemId) {
      return res.status(400).json({ message: "ID article invalide." });
    }

    const limit = req.query.limit ? Number(req.query.limit) : 80;
    const movements = await fetchStockMovements({
      agencyId: req.user.agencyId,
      itemId,
      limit
    });
    return res.json(movements);
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID article invalide." });
    }

    const item = await fetchInventoryItemById(req.user.agencyId, id);
    if (!item) {
      return res.status(404).json({ message: "Article introuvable." });
    }

    const movements = await fetchStockMovements({
      agencyId: req.user.agencyId,
      itemId: id,
      limit: 60
    });

    return res.json({
      ...item,
      movements
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const parsed = inventoryItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    let itemId;

    await withTransaction(async (client) => {
      const insertRes = await client.query(
        `INSERT INTO inventory_items (
          agency_id,
          created_by,
          sku,
          name,
          category,
          unit,
          cost_price,
          sale_price,
          stock_quantity,
          min_stock_alert,
          notes
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id`,
        [
          req.user.agencyId,
          req.user.id,
          payload.sku.trim(),
          payload.name.trim(),
          normalizeOptionalText(payload.category),
          normalizeOptionalText(payload.unit) || "unite",
          Number(payload.costPrice || 0),
          Number(payload.salePrice || 0),
          Number(payload.stockQuantity || 0),
          Number(payload.minStockAlert || 0),
          normalizeOptionalText(payload.notes)
        ]
      );
      itemId = insertRes.rows[0].id;

      if (Number(payload.stockQuantity || 0) > 0) {
        await client.query(
          `INSERT INTO stock_movements (
            agency_id,
            inventory_item_id,
            movement_type,
            quantity,
            unit_cost,
            reason,
            reference_type,
            created_by
          )
          VALUES ($1, $2, 'adjustment', $3, $4, $5, 'inventory_item_create', $6)`,
          [
            req.user.agencyId,
            itemId,
            Number(payload.stockQuantity),
            Number(payload.costPrice || 0),
            "Stock initial",
            req.user.id
          ]
        );
      }
    });

    const item = await fetchInventoryItemById(req.user.agencyId, itemId);
    return res.status(201).json(item);
  } catch (error) {
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Ce SKU existe deja pour l'agence." });
    }
    return next(error);
  }
});

router.put("/:id", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID article invalide." });
    }

    const parsed = inventoryItemSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;

    await withTransaction(async (client) => {
      const currentRes = await client.query(
        `SELECT id, stock_quantity
         FROM inventory_items
         WHERE id = $1
           AND agency_id = $2
         FOR UPDATE`,
        [id, req.user.agencyId]
      );

      if (!currentRes.rows[0]) {
        const error = new Error("Article introuvable.");
        error.status = 404;
        throw error;
      }

      const currentStock = Number(currentRes.rows[0].stock_quantity || 0);
      const nextStock = Number(payload.stockQuantity || 0);
      const delta = Math.round((nextStock - currentStock + Number.EPSILON) * 100) / 100;

      await client.query(
        `UPDATE inventory_items
         SET sku = $1,
             name = $2,
             category = $3,
             unit = $4,
             cost_price = $5,
             sale_price = $6,
             stock_quantity = $7,
             min_stock_alert = $8,
             notes = $9
         WHERE id = $10
           AND agency_id = $11`,
        [
          payload.sku.trim(),
          payload.name.trim(),
          normalizeOptionalText(payload.category),
          normalizeOptionalText(payload.unit) || "unite",
          Number(payload.costPrice || 0),
          Number(payload.salePrice || 0),
          nextStock,
          Number(payload.minStockAlert || 0),
          normalizeOptionalText(payload.notes),
          id,
          req.user.agencyId
        ]
      );

      if (delta !== 0) {
        await client.query(
          `INSERT INTO stock_movements (
            agency_id,
            inventory_item_id,
            movement_type,
            quantity,
            unit_cost,
            reason,
            reference_type,
            created_by
          )
          VALUES ($1, $2, 'adjustment', $3, $4, $5, 'inventory_item_update', $6)`,
          [
            req.user.agencyId,
            id,
            delta,
            Number(payload.costPrice || 0),
            "Ajustement via edition article",
            req.user.id
          ]
        );
      }
    });

    const item = await fetchInventoryItemById(req.user.agencyId, id);
    return res.json(item);
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error?.code === "23505") {
      return res.status(409).json({ message: "Ce SKU existe deja pour l'agence." });
    }
    return next(error);
  }
});

router.patch("/:id/stock", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID article invalide." });
    }

    const parsed = stockAdjustmentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation echouee.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;

    await withTransaction(async (client) => {
      const itemRes = await client.query(
        `SELECT stock_quantity, cost_price
         FROM inventory_items
         WHERE id = $1
           AND agency_id = $2
         FOR UPDATE`,
        [id, req.user.agencyId]
      );

      if (!itemRes.rows[0]) {
        const error = new Error("Article introuvable.");
        error.status = 404;
        throw error;
      }

      const currentStock = Number(itemRes.rows[0].stock_quantity || 0);
      const quantity = Number(payload.quantity || 0);
      const delta = payload.direction === "in" ? quantity : -quantity;
      const nextStock = Math.round((currentStock + delta + Number.EPSILON) * 100) / 100;

      if (nextStock < 0) {
        const error = new Error("Stock insuffisant pour cette sortie.");
        error.status = 400;
        throw error;
      }

      await client.query(
        `UPDATE inventory_items
         SET stock_quantity = $1
         WHERE id = $2
           AND agency_id = $3`,
        [nextStock, id, req.user.agencyId]
      );

      await client.query(
        `INSERT INTO stock_movements (
          agency_id,
          inventory_item_id,
          movement_type,
          quantity,
          unit_cost,
          reason,
          reference_type,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)`,
        [
          req.user.agencyId,
          id,
          payload.direction,
          quantity,
          payload.unitCost ?? Number(itemRes.rows[0].cost_price || 0),
          normalizeOptionalText(payload.reason),
          req.user.id
        ]
      );
    });

    const item = await fetchInventoryItemById(req.user.agencyId, id);
    return res.json(item);
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.delete("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "ID article invalide." });
    }

    const deleteRes = await query(
      `DELETE FROM inventory_items
       WHERE id = $1
         AND agency_id = $2
       RETURNING id`,
      [id, req.user.agencyId]
    );

    if (!deleteRes.rows[0]) {
      return res.status(404).json({ message: "Article introuvable." });
    }

    return res.status(204).send();
  } catch (error) {
    return next(error);
  }
});

export default router;
