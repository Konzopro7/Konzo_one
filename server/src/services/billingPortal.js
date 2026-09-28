import { getStripeClient, stripeId } from './stripeClient.js';

export async function createBillingPortalSession(agency, { cancel = false } = {}) {
  const stripe = getStripeClient();
  const reject = (message) => { const error = new Error(message); error.status = 409; throw error; };
  if (!stripe || !agency?.stripe_customer_id) reject('Aucun compte de facturation Stripe disponible.');
  const returnUrl = `${process.env.PUBLIC_CLIENT_URL || 'http://localhost:5173'}/billing`;
  const configuration = process.env.STRIPE_PORTAL_CONFIGURATION;
  const params = { customer: agency.stripe_customer_id, return_url: returnUrl,
    ...(configuration ? { configuration } : {}) };
  if (cancel) {
    if (!agency.stripe_subscription_id) reject('Aucun abonnement Stripe à annuler.');
    const subscription = await stripe.subscriptions.retrieve(agency.stripe_subscription_id);
    if (stripeId(subscription.customer) !== agency.stripe_customer_id ||
        subscription.id !== agency.stripe_subscription_id) reject('Cet abonnement ne correspond pas à votre entreprise.');
    if (!['active', 'trialing', 'past_due', 'unpaid'].includes(subscription.status)) reject('Cet abonnement est déjà terminé.');
    if (!configuration) reject('Le portail d’annulation est indisponible. Contactez le support.');
    const portalConfig = await stripe.billingPortal.configurations.retrieve(configuration);
    const policy = portalConfig.features?.subscription_cancel;
    if (!portalConfig.active || !policy?.enabled || policy.mode !== 'at_period_end') {
      reject('L’annulation en fin de période est indisponible. Contactez le support.');
    }
    params.flow_data = { type: 'subscription_cancel',
      subscription_cancel: { subscription: agency.stripe_subscription_id },
      after_completion: { type: 'redirect', redirect: { return_url: returnUrl } } };
  }
  return stripe.billingPortal.sessions.create(params);
}
