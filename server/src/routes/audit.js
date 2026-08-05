import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.use(requireAuth);

router.get("/", requireRole("admin"), async (req, res, next) => {
  try {
    const limit = Math.min(200, Math.max(20, Number(req.query.limit || 80)));
    const { rows } = await query(
      `SELECT
        l.id,
        l.action,
        l.entity_type,
        l.entity_id,
        l.path,
        l.status_code,
        l.metadata,
        l.created_at,
        u.full_name AS user_name,
        u.email AS user_email
       FROM audit_logs l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE l.agency_id = $1
       ORDER BY l.created_at DESC
       LIMIT $2`,
      [req.user.agencyId, limit]
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entity_type,
        entityId: row.entity_id,
        path: row.path,
        statusCode: Number(row.status_code || 0),
        metadata: row.metadata || null,
        createdAt: row.created_at,
        userName: row.user_name,
        userEmail: row.user_email
      }))
    );
  } catch (error) {
    return next(error);
  }
});

export default router;
