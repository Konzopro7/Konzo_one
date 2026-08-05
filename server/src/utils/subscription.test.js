import test from "node:test";
import assert from "node:assert/strict";
import {
  calcTrialDaysLeft,
  isSubscriptionAccessible,
  mapStripeSubscriptionStatus
} from "./subscription.js";

test("mapStripeSubscriptionStatus normalizes Stripe states", () => {
  assert.equal(mapStripeSubscriptionStatus("active"), "active");
  assert.equal(mapStripeSubscriptionStatus("trialing"), "trial");
  assert.equal(mapStripeSubscriptionStatus("canceled"), "canceled");
  assert.equal(mapStripeSubscriptionStatus("past_due"), "past_due");
  assert.equal(mapStripeSubscriptionStatus(""), "past_due");
});

test("isSubscriptionAccessible accepts active plans and valid trials only", () => {
  const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  assert.equal(isSubscriptionAccessible({ subscriptionStatus: "active" }), true);
  assert.equal(
    isSubscriptionAccessible({ subscriptionStatus: "trial", trialEndsAt: future }),
    true
  );
  assert.equal(
    isSubscriptionAccessible({ subscriptionStatus: "trial", trialEndsAt: past }),
    false
  );
  assert.equal(isSubscriptionAccessible({ subscriptionStatus: "canceled" }), false);
});

test("calcTrialDaysLeft returns rounded-up remaining days", () => {
  const future = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 1000).toISOString();

  assert.equal(calcTrialDaysLeft(future), 2);
  assert.equal(calcTrialDaysLeft(past), 0);
  assert.equal(calcTrialDaysLeft(null), 0);
});
