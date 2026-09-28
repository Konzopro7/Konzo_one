import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { createAuthToken } from "../utils/authToken.js";
import { isPlatformAdminEmail } from "../utils/platformAdmin.js";
import { calcTrialDaysLeft } from "../utils/subscription.js";
import { ownedImagePath } from "../utils/uploadPaths.js";
import { access } from "node:fs/promises";
import { rateLimit } from "express-rate-limit";
import { startMfaChallenge, setupMfa, verifyMfa } from "../services/mfa.js";
import { securityAudit } from "../services/securityAudit.js";
import { requestPasswordReset, resetPassword } from "../services/passwordReset.js";
import { sendEmail } from "../services/mailer.js";

const router = Router();
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, skipSuccessfulRequests: true, standardHeaders: true, legacyHeaders: false, message: { message: "Trop de tentatives. Réessayez dans quinze minutes." } });
const factorLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: true, legacyHeaders: false, message: { message: "Trop de tentatives. Réessayez dans quinze minutes." } });
router.use("/login", loginLimit);
router.use("/register", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: "Trop de créations de comptes. Réessayez plus tard." } }));
router.use("/mfa", factorLimit);
router.use(["/forgot-password", "/reset-password"], rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false, message: { message: "Trop de tentatives. Réessayez dans quinze minutes." } }));

const emailSchema = z.string().trim().toLowerCase().email("Vérifiez votre adresse email.").max(254);
const newPasswordSchema = z.string().min(8,"Le mot de passe doit contenir au moins huit caractères.").max(72).refine(value => Buffer.byteLength(value,"utf8") <= 72,"Le mot de passe est trop long.");
router.post("/forgot-password", (req, res) => {
  const parsed = z.object({ email: emailSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Vérifiez votre adresse email." });
  if (!process.env.SMTP_HOST) return res.status(503).json({ message: "L’envoi d’emails n’est pas encore configuré. Contactez l’administrateur pour récupérer votre accès.", code: "EMAIL_NOT_CONFIGURED" });
  res.status(202).json({ message: "Si cette adresse correspond à un compte actif, un lien de réinitialisation vous sera envoyé. Vérifiez aussi vos courriers indésirables." });
  // Avoid account enumeration through response timing; never return an email preview or token.
  const auditContext = { path: "/forgot-password", ip: req.ip, headers: { "user-agent": req.headers["user-agent"] } };
  setImmediate(() => requestPasswordReset(parsed.data.email, auditContext).catch(() => console.warn("Password reset email could not be delivered; inspect security audit.")));
});
router.post("/reset-password", async (req, res, next) => {
  try {
    const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: newPasswordSchema, confirmPassword: z.string() }).refine(value => value.password === value.confirmPassword).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Saisissez deux mots de passe identiques d’au moins huit caractères (72 octets maximum)." });
    const result = await resetPassword(parsed.data.token, parsed.data.password, req);
    if (!result) return res.status(400).json({ message: "Ce lien est invalide, expiré ou déjà utilisé. Demandez un nouveau lien." });
    res.json({ message: "Votre mot de passe a été modifié. Reconnectez-vous avec votre nouveau mot de passe et votre code de sécurité." });
    if (process.env.SMTP_HOST) setImmediate(() => sendEmail({ to: result.email, subject: "konzoCRM.com — Mot de passe modifié", html: "<p>Votre mot de passe a été modifié. Vos anciennes sessions sont déconnectées et votre double authentification reste inchangée.</p><p>Si vous n’êtes pas à l’origine de cette modification, contactez immédiatement l’administrateur.</p>" }).catch(() => console.warn("Password reset notification could not be delivered.")));
  } catch (error) { next(error); }
});

const registerSchema = z.object({
  agencyName: z.string().min(2, "Agency name is required."),
  fullName: z.string().min(2, "Full name is required."),
  email: emailSchema,
  password: newPasswordSchema,
  planTier: z.enum(["pro", "premium"]).default("pro")
});

const loginSchema = z.object({
  email: emailSchema,
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
    avatarUrl: user.avatar_url || null,
    email: user.email,
    role: user.role,
    isActive: user.is_active,
    mfaEnabled: Boolean(user.mfa_enabled),
    needsWelcomeGuide: user.onboarding_status === "pending",
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
         RETURNING id, agency_id, full_name, email, role, is_active, onboarding_status, avatar_url, password_hash, mfa_enabled, mfa_version`,
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

    return res.status(201).json(await startMfaChallenge(user));
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
        u.mfa_enabled,
        u.mfa_version,
        u.onboarding_status,
        u.avatar_url,
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
      await securityAudit(req, "AUTH_FAIL", null, 401);
      return res.status(401).json({ message: "Email ou mot de passe incorrect. Utilisez « Mot de passe oublié » si nécessaire." });
    }

    const user = rows[0];
    if (!user.is_active) {
      await securityAudit(req, "AUTH_FAIL", user, 403);
      return res.status(403).json({ message: "This account is deactivated." });
    }

    const isValid = await bcrypt.compare(parsed.data.password, user.password_hash);
    if (!isValid) {
      await securityAudit(req, "AUTH_FAIL", user, 401);
      return res.status(401).json({ message: "Email ou mot de passe incorrect. Utilisez « Mot de passe oublié » si nécessaire." });
    }

    req.authActor = { id: user.id, agencyId: user.agency_id };
    return res.json(await startMfaChallenge(user));
  } catch (error) {
    return next(error);
  }
});

const challengeSchema = z.object({ challengeToken: z.string().regex(/^[a-f0-9]{64}$/) });
router.post("/mfa/setup", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const parsed = challengeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Connexion invalide. Reconnectez-vous." });
    const result = await setupMfa(parsed.data.challengeToken);
    return res.status(result.status || 200).json(result);
  } catch (error) { next(error); }
});
router.post("/mfa/verify", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  try {
    const parsed = challengeSchema.extend({ code: z.string().trim().min(6).max(48) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Vérifiez votre code de sécurité." });
    const result = await verifyMfa(parsed.data.challengeToken, parsed.data.code, req);
    if (result.status) return res.status(result.status).json({ message: result.message });
    const { rows } = await query("SELECT name AS agency_name, plan_tier, subscription_status, trial_ends_at FROM agencies WHERE id=$1", [result.user.agency_id]);
    return res.json({ token: createAuthToken(result.user, { mfaVerified: true }), user: sanitizeUser({ ...result.user, ...rows[0] }), ...(result.recoveryCodes ? { recoveryCodes: result.recoveryCodes } : {}) });
  } catch (error) { next(error); }
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
        u.onboarding_status,
        u.mfa_enabled,
        u.avatar_url,
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

const profileSchema = z.object({
  fullName: z.string().trim().min(2, "Le nom doit contenir au moins deux caractères.").max(120),
  avatarUrl: z.string().url().max(2048).nullable()
});

router.put("/profile", requireAuth, async (req, res, next) => {
  try {
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Vérifiez votre nom et votre image de profil.", issues: parsed.error.flatten() });
    const { fullName, avatarUrl } = parsed.data;
    if (avatarUrl) {
      const file = ownedImagePath(avatarUrl, { agencyId: req.user.agencyId, purpose: "avatar", userId: req.user.id });
      if (!file) return res.status(400).json({ message: "Importez une image depuis votre propre profil." });
      try { await access(file); } catch {
        return res.status(400).json({ message: "Image introuvable. Importez-la à nouveau." });
      }
    }
    const { rows } = await query(
      `UPDATE users SET full_name = $1, avatar_url = $2 WHERE id = $3 AND agency_id = $4 RETURNING full_name, avatar_url`,
      [fullName, avatarUrl, req.user.id, req.user.agencyId]
    );
    if (!rows[0]) return res.status(404).json({ message: "Utilisateur introuvable." });
    return res.json({ fullName: rows[0].full_name, avatarUrl: rows[0].avatar_url });
  } catch (error) { return next(error); }
});

router.put("/onboarding", requireAuth, async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE users SET onboarding_status = 'seen'
       WHERE id = $1 AND agency_id = $2 RETURNING id`,
      [req.user.id, req.user.agencyId]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "User not found." });
    return res.json({ needsWelcomeGuide: false });
  } catch (error) {
    return next(error);
  }
});

export default router;
