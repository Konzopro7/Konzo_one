import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.use(requireAuth);

const createMemberSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  email: z.string().email("Invalid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["admin", "commercial", "finance", "readonly"]).default("commercial")
});

const roleSchema = z.object({
  role: z.enum(["admin", "commercial", "finance", "readonly"])
});

const activeSchema = z.object({
  isActive: z.boolean()
});

function parseId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

router.get("/", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, full_name, email, role, is_active, created_at
       FROM users
       WHERE agency_id = $1
       ORDER BY created_at ASC`,
      [req.user.agencyId]
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        fullName: row.full_name,
        email: row.email,
        role: row.role,
        isActive: row.is_active,
        createdAt: row.created_at
      }))
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = createMemberSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const email = payload.email.trim().toLowerCase();
    const exists = await query("SELECT id FROM users WHERE email = $1", [email]);
    if (exists.rows[0]) {
      return res.status(409).json({ message: "A user with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(payload.password, 10);
    const { rows } = await query(
      `INSERT INTO users (agency_id, full_name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING id, full_name, email, role, is_active, created_at`,
      [req.user.agencyId, payload.fullName.trim(), email, passwordHash, payload.role]
    );

    const member = rows[0];
    return res.status(201).json({
      id: member.id,
      fullName: member.full_name,
      email: member.email,
      role: member.role,
      isActive: member.is_active,
      createdAt: member.created_at
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/role", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const targetResult = await query(
      "SELECT id, role FROM users WHERE id = $1 AND agency_id = $2",
      [id, req.user.agencyId]
    );
    if (!targetResult.rows[0]) {
      return res.status(404).json({ message: "User not found." });
    }

    const target = targetResult.rows[0];
    if (target.id === req.user.id && parsed.data.role !== "admin") {
      return res.status(409).json({ message: "You cannot demote your own admin account." });
    }

    const { rows } = await query(
      `UPDATE users
       SET role = $1
       WHERE id = $2 AND agency_id = $3
       RETURNING id, full_name, email, role, is_active, created_at`,
      [parsed.data.role, id, req.user.agencyId]
    );

    const member = rows[0];
    return res.json({
      id: member.id,
      fullName: member.full_name,
      email: member.email,
      role: member.role,
      isActive: member.is_active,
      createdAt: member.created_at
    });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/active", requireRole("admin"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid user id." });
    }

    const parsed = activeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    if (id === req.user.id && !parsed.data.isActive) {
      return res.status(409).json({ message: "You cannot deactivate your own account." });
    }

    const { rows } = await query(
      `UPDATE users
       SET is_active = $1
       WHERE id = $2 AND agency_id = $3
       RETURNING id, full_name, email, role, is_active, created_at`,
      [parsed.data.isActive, id, req.user.agencyId]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "User not found." });
    }

    const member = rows[0];
    return res.json({
      id: member.id,
      fullName: member.full_name,
      email: member.email,
      role: member.role,
      isActive: member.is_active,
      createdAt: member.created_at
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
