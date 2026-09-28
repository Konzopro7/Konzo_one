import { query } from "../db.js";
import { getStripeClient, stripeId, planFromPrice } from "./stripeClient.js";
import { mapStripeSubscriptionStatus } from "../utils/subscription.js";

export async function syncStripeSubscription(subscription, { agencyId = null, attach = false, execute = query } = {}) {
  const customerId = stripeId(subscription.customer);
  const subscriptionId = stripeId(subscription);
  const item = subscription.items?.data?.[0];
  const plan = planFromPrice(stripeId(item?.price));
  if (!customerId || !subscriptionId || !plan) return null;
  const metadataAgency = Number(subscription.metadata?.agencyId) || null;
  if (agencyId && metadataAgency && agencyId !== metadataAgency) return null;
  const { rows } = await execute(`UPDATE agencies
    SET stripe_subscription_id = $1, plan_tier = $2, subscription_status = $3,
        trial_ends_at = CASE WHEN $4::bigint > 0 THEN TO_TIMESTAMP($4) ELSE trial_ends_at END,
        subscription_started_at = CASE WHEN $5::bigint > 0 THEN TO_TIMESTAMP($5) ELSE subscription_started_at END,
        subscription_ends_at = CASE WHEN $6::bigint > 0 THEN TO_TIMESTAMP($6) ELSE subscription_ends_at END,
        updated_at = NOW()
    WHERE stripe_customer_id = $7
      AND ($8::integer IS NULL OR id = $8)
      AND (stripe_subscription_id = $1 OR ($9::boolean AND
        (stripe_subscription_id IS NULL OR subscription_status IN ('past_due','canceled'))))
    RETURNING *`, [subscriptionId, plan, mapStripeSubscriptionStatus(subscription.status),
      Number(subscription.trial_end || 0), Number(item?.current_period_start || subscription.current_period_start || 0),
      Number(item?.current_period_end || subscription.current_period_end || 0), customerId, agencyId, attach]);
  return rows[0] || null;
}

export async function confirmStripeCheckout(session, agencyId, execute = query) {
  if (!Number.isInteger(agencyId) || agencyId < 1 || session.mode !== "subscription" || session.status !== "complete" || session.payment_status !== "paid" ||
      Number(session.metadata?.agencyId) !== agencyId || !stripeId(session.subscription)) {
    const error = new Error("Le paiement Stripe n'est pas confirmé pour cette entreprise.");
    error.status = 409;
    throw error;
  }
  const subscription = await getStripeClient().subscriptions.retrieve(stripeId(session.subscription));
  if (stripeId(subscription.customer) !== stripeId(session.customer) || stripeId(subscription) !== stripeId(session.subscription)) throw new Error("Stripe subscription/customer mismatch.");
  const row = await syncStripeSubscription(subscription, { agencyId, attach: subscription.status === "active", execute });
  if (!row) throw new Error("Stripe subscription does not match this workspace and its configured plan.");
  return row;
}
