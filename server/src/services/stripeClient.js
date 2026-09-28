import Stripe from "stripe";

let client;
let clientKey;
export function stripeTestMode() {
  return /^(sk|rk)_test_/.test(process.env.STRIPE_SECRET_KEY || "");
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
