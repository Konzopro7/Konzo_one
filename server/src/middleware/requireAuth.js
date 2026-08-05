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

    const user = {
      id: payload.userId,
      agencyId: payload.agencyId,
      role: payload.role,
      email: payload.email
    };

    // Backward compatibility for legacy tokens issued before V2.
    if (!user.agencyId || !user.role) {
      const { rows } = await query(
        `SELECT agency_id, role
         FROM users
         WHERE id = $1`,
        [user.id]
      );

      if (!rows[0]) {
        return res.status(401).json({ message: "Invalid authentication token." });
      }

      user.agencyId = rows[0].agency_id;
      user.role = rows[0].role;
    }

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
    return res.status(401).json({ message: "Invalid or expired authentication token." });
  }
}
