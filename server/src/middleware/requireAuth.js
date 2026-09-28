import jwt from "jsonwebtoken";
import { query } from "../db.js";
import { getJwtSecret } from "../utils/jwtSecret.js";
import { calcTrialDaysLeft, isSubscriptionAccessible } from "../utils/subscription.js";
import { expireTrials } from "../services/subscriptionExpiry.js";

const EXEMPT_PATH_PREFIXES = ["/api/auth/me", "/api/billing", "/api/platform", "/api/newsletter"];

function isExemptPath(fullPath) {
  return ["/api/auth/onboarding", "/api/auth/profile"].includes(fullPath) ||
    EXEMPT_PATH_PREFIXES.some((prefix) => fullPath.startsWith(prefix));
}

function buildFullPath(req) {
  return `${req.baseUrl || ""}${req.path || ""}`;
}

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  try {
    const payload = jwt.verify(token, getJwtSecret());

    if (!Number.isInteger(payload.userId) || payload.userId <= 0) {
      return res.status(401).json({ message: "Invalid authentication token." });
    }

    // Tokens identify a user; current database state controls their access.
    const accountRes = await query(
      `SELECT id, agency_id, role, email, is_active, mfa_enabled, mfa_version
       FROM users
       WHERE id = $1`,
      [payload.userId]
    );
    const account = accountRes.rows[0];
    if (!account || !account.is_active ||
        (payload.agencyId != null && payload.agencyId !== account.agency_id)) {
      return res.status(401).json({ message: "Invalid authentication token." });
    }

    if (!account.mfa_enabled || payload.purpose !== "access" || payload.mfaVerified !== true || payload.mfaVersion !== account.mfa_version) {
      return res.status(401).json({ code: "MFA_REQUIRED", message: "Reconnectez-vous pour effectuer la double authentification." });
    }

    const user = {
      id: account.id,
      agencyId: account.agency_id,
      role: account.role,
      email: account.email
    };

    const agencyRes = await query(
      `SELECT
        plan_tier,
        subscription_status,
        trial_ends_at,
        subscription_started_at,
        subscription_ends_at,
        is_suspended
       FROM agencies
       WHERE id = $1`,
      [user.agencyId]
    );

    if (!agencyRes.rows[0]) {
      return res.status(401).json({ message: "Agency not found for this token." });
    }

    const agency = agencyRes.rows[0];
    if (agency.is_suspended && !isExemptPath(buildFullPath(req))) {
      return res.status(403).json({code:"WORKSPACE_SUSPENDED",message:"Votre entreprise est suspendue. Contactez l’administrateur de la plateforme."});
    }
    let subscriptionStatus = agency.subscription_status || "trial";
    const trialEndsAt = agency.trial_ends_at || null;

    // Auto-expire trial status when date is reached.
    if (subscriptionStatus === "trial") {
      const trialExpired = !trialEndsAt || !(new Date(trialEndsAt).getTime() > Date.now());
      if (trialExpired) {
        await expireTrials(user.agencyId);
        const current = await query("SELECT subscription_status FROM agencies WHERE id = $1", [user.agencyId]);
        subscriptionStatus = current.rows[0]?.subscription_status || "past_due";
      }
    }

    user.subscription = {
      isSuspended:Boolean(agency.is_suspended),
      planTier: agency.plan_tier || "pro",
      subscriptionStatus,
      trialEndsAt,
      subscriptionStartedAt: agency.subscription_started_at || null,
      subscriptionEndsAt: agency.subscription_ends_at || null,
      trialDaysLeft: calcTrialDaysLeft(trialEndsAt)
    };

    req.user = user;

    const fullPath = buildFullPath(req);
    if (!isExemptPath(fullPath) && !isSubscriptionAccessible(user.subscription)) {
      return res.status(402).json({
        message:
          "Subscription inactive. Start or renew a plan to keep using the workspace.",
        code: "SUBSCRIPTION_REQUIRED",
        subscription: user.subscription
      });
    }

    return next();
  } catch (error) {
    if (["JsonWebTokenError", "TokenExpiredError", "NotBeforeError"].includes(error.name)) {
      return res.status(401).json({ message: "Invalid or expired authentication token." });
    }
    return next(error);
  }
}
