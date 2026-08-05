export const PLAN_TIERS = ["pro", "premium"];
export const SUBSCRIPTION_STATUSES = ["trial", "active", "past_due", "canceled"];

export function mapStripeSubscriptionStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();
  if (!normalized) {
    return "past_due";
  }

  if (normalized === "active") {
    return "active";
  }

  if (normalized === "trialing") {
    return "trial";
  }

  if (normalized === "canceled" || normalized === "incomplete_expired") {
    return "canceled";
  }

  return "past_due";
}

export function isSubscriptionAccessible(subscription) {
  if (!subscription) {
    return false;
  }

  const status = String(subscription.subscriptionStatus || "").toLowerCase();
  if (status === "active") {
    return true;
  }

  if (status !== "trial") {
    return false;
  }

  if (!subscription.trialEndsAt) {
    return false;
  }

  return new Date(subscription.trialEndsAt).getTime() >= Date.now();
}

export function calcTrialDaysLeft(trialEndsAt) {
  if (!trialEndsAt) {
    return 0;
  }

  const end = new Date(trialEndsAt).getTime();
  if (!Number.isFinite(end)) {
    return 0;
  }

  const diffMs = end - Date.now();
  if (diffMs <= 0) {
    return 0;
  }

  return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
}

