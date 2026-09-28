import crypto from "crypto";
import { Router } from "express";
import {
  getStripeClient,
  stripeId,
  stripeTestMode,
} from "../services/stripeClient.js";
import {
  syncStripeSubscription,
  confirmStripeCheckout,
} from "../services/stripeSubscriptions.js";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { buildPortalUrl } from "../services/templates.js";

const router = Router();

function invoiceToLineItem(invoice, currency = "CAD") {
  return {
    price_data: {
      currency: String(currency || "CAD").toLowerCase(),
      product_data: {
        name: `Invoice ${invoice.invoice_number}`,
        description: `Payment for ${invoice.invoice_number}`,
      },
      unit_amount: Math.round(Number(invoice.total || 0) * 100),
    },
    quantity: 1,
  };
}

async function getAgencyCurrency(agencyId) {
  return "CAD";
}

async function ensurePaymentToken(invoiceId) {
  const existing = await query(
    "SELECT payment_link_token FROM invoices WHERE id = $1",
    [invoiceId],
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
    [token, invoiceId],
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
    [invoiceId, agencyId],
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
    [token],
  );
  return rows[0] || null;
}

async function createCheckoutSession({
  invoice,
  currency,
  successUrl,
  cancelUrl,
}) {
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

  if (!Number.isFinite(Number(invoice.total)) || Number(invoice.total) < 0.5) {
    const error = new Error(
      "Invoice amount is below the supported card payment minimum.",
    );
    error.status = 400;
    throw error;
  }

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [invoiceToLineItem(invoice, currency)],
    customer_email: invoice.client_email || undefined,
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      invoiceId: String(invoice.id),
      agencyId: String(invoice.agency_id),
    },
  });

  await query(
    `UPDATE invoices
     SET stripe_checkout_session_id = $1
     WHERE id = $2`,
    [session.id, invoice.id],
  );

  return session;
}

async function markInvoicePaidBySession(session, execute = query) {
  const invoiceId = Number(session?.metadata?.invoiceId || 0);
  const agencyId = Number(session?.metadata?.agencyId || 0);

  if (
    !Number.isInteger(invoiceId) ||
    invoiceId <= 0 ||
    !Number.isInteger(agencyId) ||
    agencyId <= 0 ||
    session.payment_status !== "paid" ||
    session.currency !== "cad" ||
    !Number.isInteger(session.amount_total)
  ) {
    return;
  }

  await execute(
    `UPDATE invoices
     SET status = 'paid',
         payment_method = 'stripe',
         stripe_checkout_session_id = $1,
         stripe_payment_intent_id = $2
     WHERE id = $3
       AND agency_id = $4
       AND ROUND(total * 100) = $5
       AND status = 'pending'
       AND stripe_checkout_session_id = $1`,
    [
      session.id || null,
      session.payment_intent || null,
      invoiceId,
      agencyId,
      session.amount_total,
    ],
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

    if (!process.env.STRIPE_WEBHOOK_SECRET) {
      return res.status(503).send("webhook_not_configured");
    }
    if (!signature) {
      return res.status(400).send("signature_required");
    }
    if (process.env.STRIPE_WEBHOOK_SECRET && signature) {
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    }

    if (
      typeof event.livemode === "boolean" &&
      event.livemode === stripeTestMode()
    ) {
      return res.status(400).send("stripe_mode_mismatch");
    }
    const supported = [
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
      "customer.subscription.paused",
      "customer.subscription.resumed",
      "invoice.paid",
      "invoice.payment_failed",
    ];
    if (!supported.includes(event.type)) return res.json({ received: true });
    await withTransaction(async (db) => {
      const claimed = await db.query(
        `INSERT INTO stripe_webhook_events(id,event_type,livemode)
        VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id`,
        [event.id, event.type, Boolean(event.livemode)],
      );
      if (!claimed.rowCount) return;
      const execute = (sql, params) => db.query(sql, params);
      const object = event.data.object;
      if (event.type.startsWith("checkout.session.")) {
        if (object.mode === "payment")
          await markInvoicePaidBySession(object, execute);
        else if (
          object.mode === "subscription" &&
          object.payment_status === "paid"
        ) {
          await confirmStripeCheckout(
            object,
            Number(object.metadata?.agencyId),
            execute,
          );
        }
      } else {
        const id = event.type.startsWith("customer.subscription.")
          ? stripeId(object)
          : stripeId(
              object.subscription ||
                object.parent?.subscription_details?.subscription,
            );
        if (id)
          await syncStripeSubscription(
            await stripe.subscriptions.retrieve(id),
            { execute },
          );
      }
    });

    return res.json({ received: true });
  } catch (error) {
    console.error(
      "[stripe-webhook]",
      error.type || error.name,
      error.code || "processing_failed",
    );
    return res
      .status(error.type === "StripeSignatureVerificationError" ? 400 : 500)
      .send("webhook_error");
  }
}

router.get("/status", requireAuth, async (req, res) => {
  return res.json({
    enabled: Boolean(process.env.STRIPE_SECRET_KEY),
    testMode: stripeTestMode(),
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
  });
});

router.post(
  "/invoices/:id/checkout-session",
  requireAuth,
  async (req, res, next) => {
    try {
      const invoiceId = Number(req.params.id);
      if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
        return res.status(400).json({ message: "Invalid invoice id." });
      }

      const invoice = await fetchInvoiceForAgency(invoiceId, req.user.agencyId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found." });
      }

      const currency = await getAgencyCurrency(req.user.agencyId);
      const successUrl =
        process.env.STRIPE_SUCCESS_URL ||
        `${process.env.PUBLIC_CLIENT_URL || process.env.CLIENT_URL?.split(",")[0]?.trim() || "http://localhost:5173"}/invoices?payment=success&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl =
        process.env.STRIPE_CANCEL_URL ||
        `${process.env.PUBLIC_CLIENT_URL || process.env.CLIENT_URL?.split(",")[0]?.trim() || "http://localhost:5173"}/invoices?payment=cancelled`;

      const session = await createCheckoutSession({
        invoice,
        currency,
        successUrl,
        cancelUrl,
      });

      return res.json({
        checkoutUrl: session.url,
        sessionId: session.id,
      });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({ message: error.message });
      }
      return next(error);
    }
  },
);

router.get("/invoices/:id/public-link", requireAuth, async (req, res, next) => {
  try {
    const invoiceId = Number(req.params.id);
    if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
      return res.status(400).json({ message: "Invalid invoice id." });
    }

    const invoice = await fetchInvoiceForAgency(invoiceId, req.user.agencyId);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found." });
    }

    const token = await ensurePaymentToken(invoice.id);
    const apiBase = (process.env.API_URL || "http://localhost:4000").replace(
      /\/+$/,
      "",
    );
    return res.json({
      token,
      publicCheckoutEndpoint: `${apiBase}/api/payments/public/${token}/checkout-session`,
      portalUrl: buildPortalUrl("invoices", token),
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
      token: invoice.payment_link_token,
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
    // Public customers return to their document, without needing a CRM login.
    const portalUrl = buildPortalUrl("invoices", token);
    const successUrl = `${portalUrl}?payment=success`;
    const cancelUrl = `${portalUrl}?payment=cancelled`;

    const session = await createCheckoutSession({
      invoice,
      currency,
      successUrl,
      cancelUrl,
    });

    return res.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
});

export default router;
