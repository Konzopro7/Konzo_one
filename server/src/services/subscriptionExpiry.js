import cron from "node-cron";
import { query } from "../db.js";

export async function expireTrials(agencyId = null) {
  const { rows } = await query(`WITH expired AS (
    UPDATE agencies SET subscription_status = 'past_due', updated_at = NOW()
    WHERE subscription_status = 'trial'
      AND (trial_ends_at IS NULL OR trial_ends_at <= NOW())
      AND ($1::integer IS NULL OR id = $1)
    RETURNING id
  ) INSERT INTO audit_logs (agency_id, action, entity_type, entity_id, path, status_code, metadata)
    SELECT id, 'UPDATE', 'subscription', id, '/system/subscriptions/expire-trials', 200,
      '{"reason":"trial_expired","previousStatus":"trial","newStatus":"past_due"}'::jsonb
    FROM expired RETURNING agency_id`, [agencyId]);
  return rows.length;
}

export async function startSubscriptionExpiryScheduler() {
  const sweep = async () => {
    try {
      const count = await expireTrials();
      if (count) console.log(`[subscriptions] expired_trials=${count}`);
    } catch (error) {
      console.error("[subscriptions] expiry sweep failed", error.message);
    }
  };
  await sweep();
  return cron.schedule("* * * * *", sweep);
}
