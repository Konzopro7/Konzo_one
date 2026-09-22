import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { createAuthToken } from "../utils/authToken.js";
import { isPlatformAdminEmail } from "../utils/platformAdmin.js";
import { calcTrialDaysLeft } from "../utils/subscription.js";

const router = Router();

const registerSchema = z.object({
  agencyName: z.string().min(2, "Agency name is required."),
  fullName: z.string().min(2, "Full name is required."),
  email: z.string().email("Invalid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  planTier: z.enum(["pro", "premium"]).default("pro")
});

const loginSchema = z.object({
  email: z.string().email("Invalid email."),
  password: z.string().min(1, "Password is required.")
});

function slugifyAgencyName(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}

async function buildUniqueAgencySlug(client, baseName) {
  const baseSlug = slugifyAgencyName(baseName) || "agency";
  let slug = baseSlug;
  let counter = 1;

  // Keep trying until we find an available slug.
  while (true) {
    const exists = await client.query("SELECT id FROM agencies WHERE slug = $1", [slug]);
    if (!exists.rows[0]) {
      return slug;
    }
    counter += 1;
    slug = `${baseSlug}-${counter}`;
  }
}

function sanitizeUser(user) {
  const trialEndsAt = user.trial_ends_at || null;

  return {
    id: user.id,
    agencyId: user.agency_id,
    agencyName: user.agency_name,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    isActive: user.is_active,
    isPlatformAdmin: isPlatformAdminEmail(user.email),
    subscription: {
      planTier: user.plan_tier || "pro",
      subscriptionStatus: user.subscription_status || "trial",
      trialEndsAt,
      trialDaysLeft: calcTrialDaysLeft(trialEndsAt)
    }
  };
}

router.post("/register", async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const email = payload.email.trim().toLowerCase();
    if (isPlatformAdminEmail(email)) {
      return res.status(403).json({ message: "This account must be provisioned by the platform operator." });
    }

    const user = await withTransaction(async (client) => {
      const exists = await client.query("SELECT id FROM users WHERE email = $1", [email]);
      if (exists.rowCount > 0) {
        const error = new Error("An account with this email already exists.");
        error.status = 409;
        throw error;
      }

      const slug = await buildUniqueAgencySlug(client, payload.agencyName);
      const agencyInsert = await client.query(
        `INSERT INTO agencies (name, slug, plan_tier)
         VALUES ($1, $2, $3)
         RETURNING id, name, plan_tier, subscription_status, trial_ends_at`,
        [payload.agencyName.trim(), slug, payload.planTier]
      );
      const agency = agencyInsert.rows[0];

      const passwordHash = await bcrypt.hash(payload.password, 10);
      const userInsert = await client.query(
        `INSERT INTO users (agency_id, full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'admin')
         RETURNING id, agency_id, full_name, email, role, is_active`,
        [agency.id, payload.fullName.trim(), email, passwordHash]
      );
      const createdUser = userInsert.rows[0];

      await client.query(
        `INSERT INTO agency_settings (agency_id, agency_name, agency_email)
         VALUES ($1, $2, $3)`,
        [agency.id, agency.name, email]
      );

      return {
        ...createdUser,
        agency_name: agency.name,
        plan_tier: agency.plan_tier,
        subscription_status: agency.subscription_status,
        trial_ends_at: agency.trial_ends_at
      };
    });

    const token = createAuthToken(user);
    return res.status(201).json({
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const email = parsed.data.email.trim().toLowerCase();
    const { rows } = await query(
      `SELECT
        u.id,
        u.agency_id,
        u.full_name,
        u.email,
        u.role,
        u.is_active,
        u.password_hash,
        a.name AS agency_name,
        a.plan_tier,
        a.subscription_status,
        a.trial_ends_at
      FROM users u
      INNER JOIN agencies a ON a.id = u.agency_id
      WHERE u.email = $1`,
      [email]
    );

    if (!rows[0]) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const user = rows[0];
    if (!user.is_active) {
      return res.status(403).json({ message: "This account is deactivated." });
    }

    const isValid = await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const token = createAuthToken(user);
    return res.json({
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        u.id,
        u.agency_id,
        u.full_name,
        u.email,
        u.role,
        u.is_active,
        a.name AS agency_name,
        a.plan_tier,
        a.subscription_status,
        a.trial_ends_at
      FROM users u
      INNER JOIN agencies a ON a.id = u.agency_id
      WHERE u.id = $1`,
      [req.user.id]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "User not found." });
    }

    if (!rows[0].is_active) {
      return res.status(403).json({ message: "This account is deactivated." });
    }

    return res.json({ user: sanitizeUser(rows[0]) });
  } catch (error) {
    return next(error);
  }
});

export default router;
