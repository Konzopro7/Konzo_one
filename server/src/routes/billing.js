import { Router } from "express";
import { z } from "zod";
import { getStripeClient, stripeTestMode } from "../services/stripeClient.js";
import { confirmStripeCheckout } from "../services/stripeSubscriptions.js";
import { createBillingPortalSession } from "../services/billingPortal.js";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { calcTrialDaysLeft } from "../utils/subscription.js";

const router = Router();

router.use(requireAuth);

const checkoutSchema = z.object({
  planTier: z.enum(["pro", "premium"])
});

const confirmCheckoutSchema = z.object({
  sessionId: z.string().startsWith("cs_")
});

function getPlanCatalog() {
  return {
    pro: {
      id: "pro",
      label: "Pro",
      monthlyPrice: Number(process.env.PLAN_PRICE_PRO_MONTHLY || 49),
      stripePriceId: process.env.STRIPE_PRICE_PRO_MONTHLY || null
    },
    premium: {
      id: "premium",
      label: "Premium",
      monthlyPrice: Number(process.env.PLAN_PRICE_PREMIUM_MONTHLY || 99),
      stripePriceId: process.env.STRIPE_PRICE_PREMIUM_MONTHLY || null
    }
  };
}

async function fetchAgencySubscription(agencyId) {
  const { rows } = await query(
    `SELECT
      id,
      name,
      plan_tier,
      subscription_status,
      trial_ends_at,
      subscription_started_at,
      subscription_ends_at,
      stripe_customer_id,
      stripe_subscription_id
     FROM agencies
     WHERE id = $1`,
    [agencyId]
  );
  return rows[0] || null;
}

function mapSubscriptionPayload(row) {
  const trialEndsAt = row?.trial_ends_at || null;
  return {
    planTier: row?.plan_tier || "pro",
    subscriptionStatus: row?.subscription_status || "trial",
    trialEndsAt,
    trialDaysLeft: calcTrialDaysLeft(trialEndsAt),
    subscriptionStartedAt: row?.subscription_started_at || null,
    subscriptionEndsAt: row?.subscription_ends_at || null,
    stripeCustomerId: row?.stripe_customer_id || null,
    stripeSubscriptionId: row?.stripe_subscription_id || null
  };
}

async function applyLocalSubscription(agencyId, planTier) {
  const { rows } = await query(
    `UPDATE agencies
     SET plan_tier = $1,
         subscription_status = 'active',
         trial_ends_at = COALESCE(trial_ends_at, NOW()),
         subscription_started_at = COALESCE(subscription_started_at, NOW()),
         subscription_ends_at = CASE
           WHEN subscription_ends_at > NOW() THEN subscription_ends_at + INTERVAL '30 days'
           ELSE NOW() + INTERVAL '30 days'
         END
     WHERE id = $2
     RETURNING *`,
    [planTier, agencyId]
  );
  return rows[0];
}

router.get("/status", async (req, res, next) => {
  try {
    const agency = await fetchAgencySubscription(req.user.agencyId);
    if (!agency) {
      return res.status(404).json({ message: "Agency not found." });
    }

    return res.json({
      agencyId: agency.id,
      agencyName: agency.name,
      subscription: mapSubscriptionPayload(agency),
      plans: getPlanCatalog(),
      stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY),
      stripeTestMode: stripeTestMode(),
      simulated:
        process.env.NODE_ENV !== "production" &&
        (!process.env.STRIPE_SECRET_KEY ||
          !process.env.STRIPE_PRICE_PRO_MONTHLY ||
          !process.env.STRIPE_PRICE_PREMIUM_MONTHLY)
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/checkout-session", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const plans = getPlanCatalog();
    const targetPlan = plans[payload.planTier];
    if (!targetPlan) {
      return res.status(400).json({ message: "Unknown plan selected." });
    }

    const agency = await fetchAgencySubscription(req.user.agencyId);
    if (!agency) {
      return res.status(404).json({ message: "Agency not found." });
    }

    if (
      agency.subscription_status === "active" &&
      agency.plan_tier === payload.planTier
    ) {
      return res.status(409).json({
        message: `Le plan ${targetPlan.label} est déjà actif.`
      });
    }

    if (agency.stripe_subscription_id && ['active','trial'].includes(agency.subscription_status)) {
      return res.status(409).json({ message: "Un abonnement Stripe existe déjà. Gérez-le depuis le portail de facturation." });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      if (process.env.NODE_ENV !== "production") {
        const updatedAgency = await applyLocalSubscription(
          req.user.agencyId,
          payload.planTier
        );

        return res.json({
          simulated: true,
          message: "Stripe not configured. Local simulated activation applied.",
          subscription: mapSubscriptionPayload(updatedAgency)
        });
      }

      return res.status(503).json({
        message: "Stripe subscription billing is not configured yet."
      });
    }

    if (!targetPlan.stripePriceId) {
      if (process.env.NODE_ENV !== "production") {
        const updatedAgency = await applyLocalSubscription(
          req.user.agencyId,
          payload.planTier
        );

        return res.json({
          simulated: true,
          message: "Stripe price missing. Local simulated renewal applied.",
          subscription: mapSubscriptionPayload(updatedAgency)
        });
      }

      return res.status(400).json({
        message: `Missing Stripe price id for ${targetPlan.label}.`
      });
    }

    let customerId = agency.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: agency.name,
        email: req.user.email || undefined,
        metadata: {
          agencyId: String(req.user.agencyId)
        }
      });
      customerId = customer.id;

      await query(
        `UPDATE agencies
         SET stripe_customer_id = $1
         WHERE id = $2`,
        [customerId, req.user.agencyId]
      );
    }

    const successUrl =
      process.env.BILLING_SUCCESS_URL ||
      `${process.env.PUBLIC_CLIENT_URL || process.env.CLIENT_URL?.split(",")[0] || "http://localhost:5173"}/billing?billing=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      process.env.BILLING_CANCEL_URL ||
      `${process.env.PUBLIC_CLIENT_URL || process.env.CLIENT_URL?.split(",")[0] || "http://localhost:5173"}/billing?billing=cancelled`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [
        {
          price: targetPlan.stripePriceId,
          quantity: 1
        }
      ],
      metadata: {
        agencyId: String(req.user.agencyId),
        planTier: payload.planTier
      },
      subscription_data: { metadata: { agencyId: String(req.user.agencyId), planTier: payload.planTier } }
    });

    return res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/confirm-checkout", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = confirmCheckoutSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid Stripe session." });
    }

    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(503).json({ message: "Stripe is not configured." });
    }

    const session = await stripe.checkout.sessions.retrieve(parsed.data.sessionId);
    const updated = await confirmStripeCheckout(session, req.user.agencyId);

    return res.json({
      message: "Stripe subscription confirmed.",
      subscription: mapSubscriptionPayload(updated)
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ message: error.message });
    return next(error);
  }
});

router.post("/portal-session", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = z.object({ action: z.enum(['manage', 'cancel']).default('manage') }).strict().safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ message: "Action de facturation invalide." });
    const agency = await fetchAgencySubscription(req.user.agencyId);
    const session = await createBillingPortalSession(agency, { cancel: parsed.data.action === 'cancel' });
    return res.json({ portalUrl: session.url });
  } catch (error) {
    if (error.status === 409) return res.status(409).json({ message: error.message });
    return next(error);
  }
});

router.post("/simulate-cancel", requireRole("admin"), async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === "production") {
      return res.status(403).json({ message: "Simulation disabled in production." });
    }

    const { rows } = await query(
      `UPDATE agencies
       SET subscription_status = 'canceled',
           subscription_ends_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.user.agencyId]
    );

    return res.json({
      simulated: true,
      message: "Local simulated cancellation applied.",
      subscription: mapSubscriptionPayload(rows[0])
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
