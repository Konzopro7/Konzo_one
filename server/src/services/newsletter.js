import crypto from "node:crypto";
import { query, withTransaction } from "../db.js";
import { sendEmail, isEmailConfigured } from "./mailer.js";
import { getStripeClient } from "./stripeClient.js";
import {
  NEWSLETTER_CONSENT_TEXT,
  NEWSLETTER_CONSENT_VERSION,
  NEWSLETTER_DISCOUNT,
  NEWSLETTER_OFFER_TEXT,
} from "../../../shared/newsletter.mjs";

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const validToken = (token) => /^[a-f0-9]{64}$/.test(String(token));
const fail = (message, status = 409) =>
  Object.assign(new Error(message), { status });
function publicLink(action, token) {
  const url = new URL(
    process.env.PUBLIC_CLIENT_URL ||
      process.env.CLIENT_URL?.split(",")[0]?.trim() ||
      "http://localhost:5173",
  );
  if (
    url.username ||
    url.password ||
    !["http:", "https:"].includes(url.protocol) ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  )
    throw Error("Invalid newsletter frontend URL");
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/newsletter/${action}`;
  url.search = "";
  url.hash = `token=${token}`;
  return url.toString();
}
async function audit(db, req, action, user) {
  await db.query(
    `INSERT INTO audit_logs(agency_id,user_id,action,entity_type,entity_id,path,status_code,metadata)
    VALUES($1,$2,$3,'newsletter',$2,$4,200,$5)`,
    [
      user.agency_id,
      user.id,
      action,
      "/api/newsletter",
      JSON.stringify({
        ip: req.ip || null,
        consentVersion: NEWSLETTER_CONSENT_VERSION,
      }),
    ],
  );
}
export async function newsletterStatus(user) {
  const { rows } = await query(
    `SELECT a.subscription_started_at,a.stripe_subscription_id,a.subscription_status,a.newsletter_discount_redeemed_at,
    n.status,n.confirmed_at,n.prompt_dismissed_at,
    EXISTS(SELECT 1 FROM newsletter_subscriptions s JOIN users u ON u.id=s.user_id
      WHERE s.agency_id=a.id AND s.confirmed_at IS NOT NULL AND s.email=u.email AND u.is_active) AS confirmed
    FROM agencies a LEFT JOIN newsletter_subscriptions n ON n.user_id=$1 AND n.agency_id=a.id AND n.email=$3 WHERE a.id=$2`,
    [user.id, user.agencyId, user.email],
  );
  const row = rows[0];
  if (!row) throw fail("Espace introuvable.", 404);
  const eligible =
    !row.subscription_started_at &&
    !row.stripe_subscription_id &&
    !row.newsletter_discount_redeemed_at &&
    row.subscription_status !== "active";
  return {
    status: row.status || "not_subscribed",
    confirmedAt: row.confirmed_at,
    promptDismissed: Boolean(row.prompt_dismissed_at),
    email: user.email,
    offerEligible: eligible,
    discountReady: eligible && row.confirmed,
    discountPercent: NEWSLETTER_DISCOUNT,
    emailEnabled: isEmailConfigured(),
  };
}
export async function subscribeNewsletter(user, req, deliver = sendEmail) {
  if (!isEmailConfigured())
    throw fail("L’inscription par email est temporairement indisponible.", 503);
  const confirmation = crypto.randomBytes(32).toString("hex");
  const unsubscribe = crypto.randomBytes(32).toString("hex");
  const confirmationUrl = publicLink("confirm", confirmation);
  const unsubscribeUrl = publicLink("unsubscribe", unsubscribe);
  const result = await withTransaction(async (db) => {
    const account = (
      await db.query(
        "SELECT id,agency_id,email,is_active FROM users WHERE id=$1 FOR UPDATE",
        [user.id],
      )
    ).rows[0];
    if (
      !account?.is_active ||
      account.agency_id !== user.agencyId ||
      account.email !== user.email
    )
      throw fail("Reconnectez-vous pour vous inscrire.", 401);
    const current = (
      await db.query(
        "SELECT *, requested_at > NOW()-INTERVAL '90 seconds' AS too_recent FROM newsletter_subscriptions WHERE user_id=$1",
        [user.id],
      )
    ).rows[0];
    if (current?.status === "subscribed" && current.email === user.email)
      return { alreadySubscribed: true };
    if (current?.too_recent)
      throw fail(
        "Un email vient d’être envoyé. Patientez avant de réessayer.",
        429,
      );
    await db.query(
      `INSERT INTO newsletter_subscriptions(user_id,agency_id,email,status,confirmation_hash,confirmation_expires_at,unsubscribe_hash,requested_at,consent_version,consent_proof)
      VALUES($1,$2,$3,'pending',$4,NOW()+INTERVAL '24 hours',$5,NOW(),$6,$7)
      ON CONFLICT(user_id) DO UPDATE SET email=EXCLUDED.email,status='pending',confirmation_hash=EXCLUDED.confirmation_hash,
      confirmation_expires_at=EXCLUDED.confirmation_expires_at,unsubscribe_hash=EXCLUDED.unsubscribe_hash,requested_at=NOW(),
      confirmed_at=CASE WHEN newsletter_subscriptions.email=EXCLUDED.email THEN newsletter_subscriptions.confirmed_at ELSE NULL END,
      consent_version=EXCLUDED.consent_version,consent_proof=EXCLUDED.consent_proof,updated_at=NOW()`,
      [
        user.id,
        user.agencyId,
        user.email,
        hash(confirmation),
        hash(unsubscribe),
        NEWSLETTER_CONSENT_VERSION,
        JSON.stringify({
          text: NEWSLETTER_CONSENT_TEXT,
          source: "authenticated_newsletter_form",
          ip: req.ip || null,
          userAgent: String(req.headers?.["user-agent"] || "").slice(0, 300),
        }),
      ],
    );
    await audit(db, req, "NEWSLETTER_REQUEST", account);
    return {};
  });
  if (result.alreadySubscribed) return result;
  try {
    await deliver({
      to: user.email,
      subject: "konzoCRM.com — Confirmez votre inscription à la newsletter",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#123e50"><h2>Newsletter konzoCRM.com</h2><p>${NEWSLETTER_CONSENT_TEXT}</p><p><a href="${confirmationUrl}">Confirmer mon inscription</a></p><p>Ce lien expire dans 24 heures.</p><p>${NEWSLETTER_OFFER_TEXT}</p><p><a href="${unsubscribeUrl}">Annuler cette demande ou me désabonner</a></p><p>Une inscription non confirmée ne déclenche aucun email marketing.</p></div>`,
    });
  } catch {
    await query(
      "UPDATE newsletter_subscriptions SET confirmation_hash=NULL,confirmation_expires_at=NULL,requested_at=NULL WHERE user_id=$1 AND confirmation_hash=$2",
      [user.id, hash(confirmation)],
    );
    throw fail(
      "L’email de confirmation n’a pas pu être envoyé. Réessayez.",
      503,
    );
  }
  return result;
}
export async function newsletterTokenAction(token, action, req) {
  if (!validToken(token) || !["confirm", "unsubscribe"].includes(action))
    throw fail("Lien invalide ou expiré.", 400);
  return withTransaction(async (db) => {
    const column =
      action === "confirm" ? "confirmation_hash" : "unsubscribe_hash";
    const row = (
      await db.query(
        `SELECT n.*,u.email AS current_email,u.is_active FROM newsletter_subscriptions n JOIN users u ON u.id=n.user_id WHERE n.${column}=$1 FOR UPDATE OF n`,
        [hash(token)],
      )
    ).rows[0];
    if (
      !row ||
      row.email !== row.current_email ||
      !row.is_active ||
      (action === "confirm" &&
        (!(new Date(row.confirmation_expires_at).getTime() > Date.now()) ||
          row.status !== "pending"))
    )
      throw fail("Lien invalide, expiré ou déjà utilisé.", 400);
    await db.query(
      action === "confirm"
        ? `UPDATE newsletter_subscriptions SET status='subscribed',confirmed_at=COALESCE(confirmed_at,NOW()),confirmation_hash=NULL,confirmation_expires_at=NULL,unsubscribed_at=NULL,prompt_dismissed_at=NOW(),updated_at=NOW() WHERE user_id=$1`
        : `UPDATE newsletter_subscriptions SET status='unsubscribed',unsubscribed_at=NOW(),confirmation_hash=NULL,confirmation_expires_at=NULL,prompt_dismissed_at=NOW(),updated_at=NOW() WHERE user_id=$1`,
      [row.user_id],
    );
    await audit(
      db,
      req,
      action === "confirm" ? "NEWSLETTER_CONFIRMED" : "NEWSLETTER_WITHDRAW",
      { id: row.user_id, agency_id: row.agency_id },
    );
  });
}
export async function dismissNewsletter(user) {
  await query(
    `INSERT INTO newsletter_subscriptions(user_id,agency_id,email,status,prompt_dismissed_at) VALUES($1,$2,$3,'unsubscribed',NOW())
    ON CONFLICT(user_id) DO UPDATE SET prompt_dismissed_at=NOW()`,
    [user.id, user.agencyId, user.email],
  );
}
export async function unsubscribeNewsletter(user, req) {
  await withTransaction(async (db) => {
    await db.query(
      `UPDATE newsletter_subscriptions SET status='unsubscribed',unsubscribed_at=NOW(),confirmation_hash=NULL,confirmation_expires_at=NULL,prompt_dismissed_at=NOW(),updated_at=NOW() WHERE user_id=$1 AND agency_id=$2`,
      [user.id, user.agencyId],
    );
    await audit(db, req, "NEWSLETTER_WITHDRAW", {
      id: user.id,
      agency_id: user.agencyId,
    });
  });
}
// One private coupon per workspace, capped by Stripe to a single redemption.
// Email confirmation earns eligibility; withdrawing marketing consent does not remove it.
export async function newsletterCheckoutDiscount(agencyId, priceId) {
  return withTransaction(async (db) => {
    const agency = (
      await db.query("SELECT * FROM agencies WHERE id=$1 FOR UPDATE", [
        agencyId,
      ])
    ).rows[0];
    if (
      !agency ||
      agency.subscription_started_at ||
      agency.stripe_subscription_id ||
      agency.newsletter_discount_redeemed_at ||
      agency.subscription_status === "active"
    )
      return null;
    const consent = await db.query(
      `SELECT 1 FROM newsletter_subscriptions n JOIN users u ON u.id=n.user_id
      WHERE n.agency_id=$1 AND n.confirmed_at IS NOT NULL AND n.email=u.email AND u.is_active LIMIT 1`,
      [agencyId],
    );
    if (!consent.rows.length) return null;
    const stripe = getStripeClient();
    const price = await stripe.prices.retrieve(priceId);
    if (
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1
    )
      throw fail(
        "Cette offre s’applique uniquement à un abonnement mensuel.",
        409,
      );
    const id =
      agency.newsletter_coupon_id || `konzocrm_newsletter5_agency_${agencyId}`;
    let coupon;
    try {
      coupon = await stripe.coupons.retrieve(id);
    } catch (error) {
      if (error.code !== "resource_missing") throw error;
      coupon = await stripe.coupons.create(
        {
          id,
          name: "Newsletter : 5 % sur le premier mois",
          percent_off: NEWSLETTER_DISCOUNT,
          duration: "once",
          max_redemptions: 1,
          metadata: { agencyId: String(agencyId) },
        },
        { idempotencyKey: `newsletter-coupon-${agencyId}` },
      );
    }
    if (
      coupon.percent_off !== NEWSLETTER_DISCOUNT ||
      coupon.duration !== "once" ||
      coupon.max_redemptions !== 1 ||
      coupon.metadata?.agencyId !== String(agencyId)
    )
      throw fail("La configuration de l’offre doit être vérifiée.", 503);
    if (!coupon.valid || coupon.times_redeemed > 0)
      throw fail(
        'Cette remise a déjà été utilisée dans Stripe. Consultez « Gérer ma facturation Stripe » pour terminer votre premier paiement ou contactez facturation@konzocrm.com.',
        409,
      );
    await db.query("UPDATE agencies SET newsletter_coupon_id=$1 WHERE id=$2", [
      coupon.id,
      agencyId,
    ]);
    return coupon.id;
  });
}
