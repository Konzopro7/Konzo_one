import jwt from "jsonwebtoken";
import { query } from "../db.js";
import { getJwtSecret } from "../utils/jwtSecret.js";
import { calcTrialDaysLeft, isSubscriptionAccessible } from "../utils/subscription.js";

const EXEMPT_PATH_PREFIXES = ["/api/auth/me", "/api/billing", "/api/platform"];

function isExemptPath(fullPath) {
  return EXEMPT_PATH_PREFIXES.some((prefix) => fullPath.startsWith(prefix));
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
    // This also supports legacy tokens without embedded agency or role claims.
    const accountRes = await query(
      `SELECT id, agency_id, role, email, is_active
       FROM users
       WHERE id = $1`,
      [payload.userId]
    );
    const account = accountRes.rows[0];
    if (!account || !account.is_active ||
        (payload.agencyId != null && payload.agencyId !== account.agency_id)) {
      return res.status(401).json({ message: "Invalid authentication token." });
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
        subscription_ends_at
       FROM agencies
       WHERE id = $1`,
      [user.agencyId]
    );

    if (!agencyRes.rows[0]) {
      return res.status(401).json({ message: "Agency not found for this token." });
    }

    const agency = agencyRes.rows[0];
    let subscriptionStatus = agency.subscription_status || "trial";
    const trialEndsAt = agency.trial_ends_at || null;

    // Auto-expire trial status when date is reached.
    if (subscriptionStatus === "trial" && trialEndsAt) {
      const trialExpired = new Date(trialEndsAt).getTime() < Date.now();
      if (trialExpired) {
        const updateRes = await query(
          `UPDATE agencies
           SET subscription_status = 'past_due'
           WHERE id = $1
             AND subscription_status = 'trial'
           RETURNING subscription_status`,
          [user.agencyId]
        );
        if (updateRes.rows[0]?.subscription_status) {
          subscriptionStatus = updateRes.rows[0].subscription_status;
        }
      }
    }

    user.subscription = {
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
