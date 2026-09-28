import test from 'node:test';
import assert from 'node:assert/strict';
import { getStripeClient } from './stripeClient.js';
import { createBillingPortalSession } from './billingPortal.js';

test('Cancellation portal verifies ownership and end-of-period policy without canceling automatically', async t => {
  const keys = ['STRIPE_SECRET_KEY', 'STRIPE_MODE', 'STRIPE_PORTAL_CONFIGURATION', 'PUBLIC_CLIENT_URL'];
  const before = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  Object.assign(process.env, { STRIPE_SECRET_KEY: 'sk_test_portal_fixture', STRIPE_MODE: 'test', STRIPE_PORTAL_CONFIGURATION: 'bpc_fixture', PUBLIC_CLIENT_URL: 'https://example.invalid' });
  try {
    const stripe = getStripeClient();
    let subscription = { id: 'sub_own', customer: 'cus_own', status: 'active' };
    let policy = { active: true, features: { subscription_cancel: { enabled: true, mode: 'at_period_end' } } };
    const sessions = [];
    t.mock.method(stripe.subscriptions, 'retrieve', async () => subscription);
    t.mock.method(stripe.billingPortal.configurations, 'retrieve', async () => policy);
    t.mock.method(stripe.billingPortal.sessions, 'create', async params => { sessions.push(params); return { url: 'https://billing.stripe.com/fixture' }; });
    const agency = { stripe_customer_id: 'cus_own', stripe_subscription_id: 'sub_own' };
    await createBillingPortalSession(agency, { cancel: true });
    assert.deepEqual(sessions[0].flow_data, { type: 'subscription_cancel', subscription_cancel: { subscription: 'sub_own' }, after_completion: { type: 'redirect', redirect: { return_url: 'https://example.invalid/billing' } } });
    assert.equal(sessions[0].customer, 'cus_own');
    assert.equal(sessions[0].configuration, 'bpc_fixture');
    subscription = { ...subscription, customer: 'cus_foreign' };
    await assert.rejects(createBillingPortalSession(agency, { cancel: true }), { status: 409 });
    subscription = { ...subscription, customer: { id: 'cus_own' }, status: 'canceled' };
    await assert.rejects(createBillingPortalSession(agency, { cancel: true }), { status: 409 });
    subscription = { ...subscription, status: 'active' };
    policy.features.subscription_cancel.mode = 'immediately';
    await assert.rejects(createBillingPortalSession(agency, { cancel: true }), { status: 409 });
    await assert.rejects(createBillingPortalSession({ stripe_customer_id: 'cus_own' }, { cancel: true }), { status: 409 });
    assert.equal(sessions.length, 1);
    await createBillingPortalSession(agency);
    assert.equal(sessions[1].flow_data, undefined);
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});
