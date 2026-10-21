import Stripe from "stripe";

let client;
let clientKey;
export function stripeTestMode() {
  return /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || "");
}
export function realPaymentsReady({ subscription = false } = {}) {
  return /^(sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY || "") &&
    process.env.STRIPE_MODE === "live" &&
    Boolean(process.env.STRIPE_WEBHOOK_SECRET) &&
    (!subscription || Boolean(process.env.STRIPE_PRICE_PRO_MONTHLY && process.env.STRIPE_PRICE_PREMIUM_MONTHLY));
}
export function assertProductionPaymentsReady(options) {
  if (process.env.NODE_ENV !== "production" || realPaymentsReady(options)) return;
  const error = new Error("Le paiement en ligne n'est pas encore disponible. Contactez le support.");
  error.status = 503;
  error.code = "PAYMENTS_NOT_READY";
  throw error;
}
export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (process.env.STRIPE_MODE === "test" && !stripeTestMode()) {
    throw new Error("Stripe test mode requires a test API key.");
  }
  if (!client || clientKey !== key) {
    client = new Stripe(key, { timeout: 12000, maxNetworkRetries: 1 });
    clientKey = key;
  }
  return client;
}
export const stripeId = value => typeof value === "string" ? value : value?.id || null;
export function planFromPrice(priceId) {
  if (priceId && priceId === process.env.STRIPE_PRICE_PRO_MONTHLY) return "pro";
  if (priceId && priceId === process.env.STRIPE_PRICE_PREMIUM_MONTHLY) return "premium";
  return null;
}
