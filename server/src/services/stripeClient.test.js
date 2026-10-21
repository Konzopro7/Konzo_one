import test from "node:test";
import assert from "node:assert/strict";
import { assertProductionPaymentsReady, realPaymentsReady } from "./stripeClient.js";

test("production payments require live Stripe credentials, a webhook and subscription prices", (t) => {
  const keys = ["NODE_ENV", "STRIPE_MODE", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_PREMIUM_MONTHLY"];
  const before = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  });
  Object.assign(process.env, {
    NODE_ENV: "production",
    STRIPE_MODE: "test",
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_PRICE_PRO_MONTHLY: "price_pro",
    STRIPE_PRICE_PREMIUM_MONTHLY: "price_premium",
  });
  assert.equal(realPaymentsReady({ subscription: true }), false);
  assert.throws(() => assertProductionPaymentsReady({ subscription: true }), { status: 503, code: "PAYMENTS_NOT_READY" });
  process.env.STRIPE_SECRET_KEY = "sk_live_fixture";
  assert.equal(realPaymentsReady(), false);
  process.env.STRIPE_MODE = "live";
  assert.equal(realPaymentsReady({ subscription: true }), true);
  process.env.STRIPE_PRICE_PRO_MONTHLY = "";
  assert.equal(realPaymentsReady(), true);
  assert.equal(realPaymentsReady({ subscription: true }), false);
  process.env.STRIPE_PRICE_PRO_MONTHLY = "price_pro";
  process.env.STRIPE_WEBHOOK_SECRET = "";
  assert.equal(realPaymentsReady(), false);
});
