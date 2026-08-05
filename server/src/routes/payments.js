import crypto from "crypto";
import { Router } from "express";
import Stripe from "stripe";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { mapStripeSubscriptionStatus } from "../utils/subscription.js";
import { buildPortalUrl } from "../services/templates.js";

const router = Router();

let stripeClient;

function getStripeClient() {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

function invoiceToLineItem(invoice, currency = "CAD") {
  return {
    price_data: {
      currency: String(currency || "CAD").toLowerCase(),
      product_data: {
        name: `Invoice ${invoice.invoice_number}`,
        description: `Payment for ${invoice.invoice_number}`
      },
      unit_amount: Math.max(50, Math.round(Number(invoice.total || 0) * 100))
    },
    quantity: 1
  };
}

async function getAgencyCurrency(agencyId) {
  return "CAD";
}

async function ensurePaymentToken(invoiceId) {
  const existing = await query(
    "SELECT payment_link_token FROM invoices WHERE id = $1",
    [invoiceId]
  );
  if (existing.rows[0]?.payment_link_token) {
    return existing.rows[0].payment_link_token;
  }

  const token = crypto.randomBytes(16).toString("hex");
  const { rows } = await query(
    `UPDATE invoices
     SET payment_link_token = $1
     WHERE id = $2
     RETURNING payment_link_token`,
    [token, invoiceId]
  );
  return rows[0]?.payment_link_token || token;
}

async function fetchInvoiceForAgency(invoiceId, agencyId) {
  const { rows } = await query(
    `SELECT
      i.id,
      i.agency_id,
      i.invoice_number,
      i.status,
      i.total,
      i.client_id,
      i.payment_link_token,
      c.email AS client_email,
      c.name AS client_name
    FROM invoices i
    INNER JOIN clients c ON c.id = i.client_id
    WHERE i.id = $1
      AND i.agency_id = $2`,
    [invoiceId, agencyId]
  );
  return rows[0] || null;
}

async function fetchInvoiceForPublicToken(token) {
  const { rows } = await query(
    `SELECT
      i.id,
      i.agency_id,
      i.invoice_number,
      i.status,
      i.total,
      i.client_id,
      i.payment_link_token,
      c.email AS client_email,
      c.name AS client_name
    FROM invoices i
    INNER JOIN clients c ON c.id = i.client_id
    WHERE i.payment_link_token = $1`,
    [token]
  );
  return rows[0] || null;
}

async function createCheckoutSession({ invoice, currency, successUrl, cancelUrl }) {
  const stripe = getStripeClient();
  if (!stripe) {
    const error = new Error("Stripe is not configured.");
    error.status = 503;
    throw error;
  }

  if (invoice.status === "paid") {
    const error = new Error("Invoice is already paid.");
    error.status = 409;
    throw error;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [invoiceToLineItem(invoice, currency)],
    customer_email: invoice.client_email || undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      invoiceId: String(invoice.id),
      agencyId: String(invoice.agency_id)
    }
  });

  await query(
    `UPDATE invoices
     SET stripe_checkout_session_id = $1
     WHERE id = $2`,
    [session.id, invoice.id]
  );

  return session;
}

async function markInvoicePaidBySession(session) {
  const invoiceId = Number(session?.metadata?.invoiceId || 0);
  const agencyId = Number(session?.metadata?.agencyId || 0);

  if (!invoiceId || !agencyId) {
    return;
  }

  await query(
    `UPDATE invoices
     SET status = 'paid',
         payment_method = 'stripe',
         stripe_checkout_session_id = $1,
         stripe_payment_intent_id = $2
     WHERE id = $3
       AND agency_id = $4`,
    [session.id || null, session.payment_intent || null, invoiceId, agencyId]
  );
}

async function markAgencySubscriptionFromCheckout(session) {
  const agencyId = Number(session?.metadata?.agencyId || 0);
  if (!agencyId) {
    return;
  }

  const planTier = String(session?.metadata?.planTier || "pro").toLowerCase() === "premium"
    ? "premium"
    : "pro";

  const customerId = session?.customer ? String(session.customer) : null;
  const subscriptionId = session?.subscription ? String(session.subscription) : null;

  await query(
    `UPDATE agencies
     SET plan_tier = $1,
         subscription_status = 'active',
         trial_ends_at = COALESCE(trial_ends_at, NOW()),
         subscription_started_at = NOW(),
         subscription_ends_at = NOW() + INTERVAL '30 days',
         stripe_customer_id = COALESCE($2, stripe_customer_id),
         stripe_subscription_id = COALESCE($3, stripe_subscription_id)
     WHERE id = $4`,
    [planTier, customerId, subscriptionId, agencyId]
  );
}

function mapPlanTierFromPriceId(priceId) {
  const proPriceId = process.env.STRIPE_PRICE_PRO_MONTHLY;
  const premiumPriceId = process.env.STRIPE_PRICE_PREMIUM_MONTHLY;

  if (priceId && premiumPriceId && priceId === premiumPriceId) {
    return "premium";
  }
  if (priceId && proPriceId && priceId === proPriceId) {
    return "pro";
  }
  return null;
}

async function syncAgencySubscriptionFromStripe(stripeSubscription) {
  const subscriptionId = String(stripeSubscription?.id || "");
  const customerId = String(stripeSubscription?.customer || "");

  if (!subscriptionId && !customerId) {
    return;
  }

  const currentPeriodEnd = Number(stripeSubscription?.current_period_end || 0);
  const currentPeriodStart = Number(stripeSubscription?.current_period_start || 0);

  const firstItem = stripeSubscription?.items?.data?.[0];
  const priceId = firstItem?.price?.id || null;
  const inferredPlan = mapPlanTierFromPriceId(priceId);
  const mappedStatus = mapStripeSubscriptionStatus(stripeSubscription?.status);

  await query(
    `UPDATE agencies
     SET stripe_customer_id = CASE WHEN $1 <> '' THEN $1 ELSE stripe_customer_id END,
         stripe_subscription_id = CASE WHEN $2 <> '' THEN $2 ELSE stripe_subscription_id END,
         plan_tier = COALESCE($3, plan_tier),
         subscription_status = $4,
         trial_ends_at = COALESCE(trial_ends_at, NOW()),
         subscription_started_at = CASE
           WHEN $5 > 0 THEN TO_TIMESTAMP($5)
           ELSE subscription_started_at
         END,
         subscription_ends_at = CASE
           WHEN $6 > 0 THEN TO_TIMESTAMP($6)
           ELSE subscription_ends_at
         END
     WHERE stripe_subscription_id = $2
        OR stripe_customer_id = $1`,
    [customerId, subscriptionId, inferredPlan, mappedStatus, currentPeriodStart, currentPeriodEnd]
  );
}

export async function handleStripeWebhook(req, res) {
  try {
    const stripe = getStripeClient();
    if (!stripe) {
      return res.status(503).send("stripe_not_configured");
    }

    const signature = req.headers["stripe-signature"];
    let event;

    if (process.env.STRIPE_WEBHOOK_SECRET && signature) {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      event = JSON.parse(req.body.toString("utf8"));
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      if (session?.mode === "payment") {
        await markInvoicePaidBySession(session);
      } else if (session?.mode === "subscription") {
        await markAgencySubscriptionFromCheckout(session);
      }
    }

    if (event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      if (session?.mode === "payment") {
        await markInvoicePaidBySession(session);
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await syncAgencySubscriptionFromStripe(event.data.object);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("[stripe-webhook]", error);
    return res.status(400).send("webhook_error");
  }
}

router.get("/status", requireAuth, async (req, res) => {
  return res.json({
    enabled: Boolean(process.env.STRIPE_SECRET_KEY),
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null
  });
});

router.post("/invoices/:id/checkout-session", requireAuth, async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ message: "Invalid invoice id." });
    }

    const invoice = await fetchInvoiceForAgency(invoiceId, req.user.agencyId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const currency = await getAgencyCurrency(req.user.agencyId);
    const successUrl =
      process.env.STRIPE_SUCCESS_URL ||
      `${process.env.CLIENT_URL || "http://localhost:5173"}/invoices?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      process.env.STRIPE_CANCEL_URL ||
      `${process.env.CLIENT_URL || "http://localhost:5173"}/invoices?payment=cancelled`;

    const session = await createCheckoutSession({
      invoice,
      currency,
      successUrl,
      cancelUrl
    });

    return res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

router.get("/invoices/:id/public-link", requireAuth, async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isFinite(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ message: "Invalid invoice id." });
    }

    const invoice = await fetchInvoiceForAgency(invoiceId, req.user.agencyId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const token = await ensurePaymentToken(invoice.id);
    const apiBase = (process.env.API_URL || "http://localhost:4000").replace(/\/+$/, "");
    return res.json({
      token,
      publicCheckoutEndpoint: `${apiBase}/api/payments/public/${token}/checkout-session`,
      portalUrl: buildPortalUrl("invoices", token)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/public/:token", async (req, res, next) => {
  try {
    const token = String(req.params.token || "");
    if (!token) {
      return res.status(400).json({ message: "Missing token." });
    }

    const invoice = await fetchInvoiceForPublicToken(token);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    return res.json({
      id: invoice.id,
      invoiceNumber: invoice.invoice_number,
      status: invoice.status,
      total: Number(invoice.total || 0),
      clientName: invoice.client_name,
      token: invoice.payment_link_token
    });
  } catch (error) {
    return next(error);
  }
});

router.post("/public/:token/checkout-session", async (req, res, next) => {
  try {
    const token = String(req.params.token || "");
    if (!token) {
      return res.status(400).json({ message: "Missing token." });
    }

    const invoice = await fetchInvoiceForPublicToken(token);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const currency = await getAgencyCurrency(invoice.agency_id);
    const successUrl =
      process.env.STRIPE_SUCCESS_URL ||
      `${process.env.CLIENT_URL || "http://localhost:5173"}/invoices?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl =
      process.env.STRIPE_CANCEL_URL ||
      `${process.env.CLIENT_URL || "http://localhost:5173"}/invoices?payment=cancelled`;

    const session = await createCheckoutSession({
      invoice,
      currency,
      successUrl,
      cancelUrl
    });

    return res.json({
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

export default router;
