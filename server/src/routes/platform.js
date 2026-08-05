import { Router } from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { isPlatformAdminEmail } from "../utils/platformAdmin.js";

const router = Router();

router.use(requireAuth);

router.use((req, res, next) => {
  if (!isPlatformAdminEmail(req.user.email)) {
    return res.status(403).json({
      message: "Platform admin access required."
    });
  }

  return next();
});

router.get("/overview", async (req, res, next) => {
  try {
    const [agenciesRes, usersRes, signupsRes, trafficRes, topPathsRes, recentRes] =
      await Promise.all([
        query(
          `SELECT
            COUNT(*)::INT AS total_agencies,
            COUNT(*) FILTER (WHERE subscription_status = 'trial' AND trial_ends_at > NOW())::INT AS active_trials,
            COUNT(*) FILTER (WHERE subscription_status = 'active')::INT AS active_subscriptions,
            COUNT(*) FILTER (WHERE subscription_status = 'past_due')::INT AS past_due,
            COUNT(*) FILTER (WHERE subscription_status = 'canceled')::INT AS canceled,
            COUNT(*) FILTER (WHERE plan_tier = 'pro')::INT AS pro_count,
            COUNT(*) FILTER (WHERE plan_tier = 'premium')::INT AS premium_count
           FROM agencies`
        ),
        query(
          `SELECT
            COUNT(*)::INT AS total_users,
            COUNT(*) FILTER (WHERE is_active = true)::INT AS active_users
           FROM users`
        ),
        query(
          `WITH day_series AS (
            SELECT generate_series(
              CURRENT_DATE - INTERVAL '29 days',
              CURRENT_DATE,
              INTERVAL '1 day'
            )::DATE AS day
          ),
          signups AS (
            SELECT created_at::DATE AS day, COUNT(*)::INT AS value
            FROM agencies
            WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
            GROUP BY created_at::DATE
          )
          SELECT
            ds.day::TEXT AS day,
            COALESCE(s.value, 0)::INT AS value
          FROM day_series ds
          LEFT JOIN signups s ON s.day = ds.day
          ORDER BY ds.day ASC`
        ),
        query(
          `WITH day_series AS (
            SELECT generate_series(
              CURRENT_DATE - INTERVAL '29 days',
              CURRENT_DATE,
              INTERVAL '1 day'
            )::DATE AS day
          ),
          reqs AS (
            SELECT created_at::DATE AS day, COUNT(*)::INT AS value
            FROM api_request_logs
            WHERE created_at >= CURRENT_DATE - INTERVAL '29 days'
            GROUP BY created_at::DATE
          )
          SELECT
            ds.day::TEXT AS day,
            COALESCE(r.value, 0)::INT AS value
          FROM day_series ds
          LEFT JOIN reqs r ON r.day = ds.day
          ORDER BY ds.day ASC`
        ),
        query(
          `SELECT
            path,
            COUNT(*)::INT AS count
           FROM api_request_logs
           WHERE created_at >= NOW() - INTERVAL '7 days'
           GROUP BY path
           ORDER BY count DESC
           LIMIT 8`
        ),
        query(
          `SELECT
            l.id,
            l.method,
            l.path,
            l.status_code,
            l.duration_ms,
            l.created_at,
            a.name AS agency_name,
            u.full_name AS user_name,
            u.email AS user_email
           FROM api_request_logs l
           LEFT JOIN agencies a ON a.id = l.agency_id
           LEFT JOIN users u ON u.id = l.user_id
           ORDER BY l.created_at DESC
           LIMIT 40`
        )
      ]);

    const agencies = agenciesRes.rows[0] || {};
    const users = usersRes.rows[0] || {};

    const proCount = Number(agencies.pro_count || 0);
    const premiumCount = Number(agencies.premium_count || 0);
    const monthlyRevenueEstimate =
      proCount * Number(process.env.PLAN_PRICE_PRO_MONTHLY || 49) +
      premiumCount * Number(process.env.PLAN_PRICE_PREMIUM_MONTHLY || 99);

    return res.json({
      metrics: {
        totalAgencies: Number(agencies.total_agencies || 0),
        activeTrials: Number(agencies.active_trials || 0),
        activeSubscriptions: Number(agencies.active_subscriptions || 0),
        pastDue: Number(agencies.past_due || 0),
        canceled: Number(agencies.canceled || 0),
        totalUsers: Number(users.total_users || 0),
        activeUsers: Number(users.active_users || 0),
        proCount,
        premiumCount,
        monthlyRevenueEstimate
      },
      signupSeries: signupsRes.rows.map((row) => ({
        day: row.day,
        value: Number(row.value || 0)
      })),
      trafficSeries: trafficRes.rows.map((row) => ({
        day: row.day,
        value: Number(row.value || 0)
      })),
      topPaths: topPathsRes.rows.map((row) => ({
        path: row.path,
        count: Number(row.count || 0)
      })),
      recentActivity: recentRes.rows.map((row) => ({
        id: row.id,
        method: row.method,
        path: row.path,
        statusCode: Number(row.status_code || 0),
        durationMs: Number(row.duration_ms || 0),
        createdAt: row.created_at,
        agencyName: row.agency_name || "Unknown agency",
        userName: row.user_name || null,
        userEmail: row.user_email || null
      }))
    });
  } catch (error) {
    return next(error);
  }
});

export default router;

