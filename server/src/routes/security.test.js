import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import Stripe from "stripe";
import pool from "../db.js";
import pipeline from "./pipeline.js";
import { handleStripeWebhook } from "./payments.js";
import { verifyWhatsappWebhook } from "../middleware/verifyWhatsappWebhook.js";

function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } };
}
function environment(t, values) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value == null) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) delete process.env[key]; else process.env[key] = value;
    }
  });
}

test("Stripe never accepts unsigned events, including when webhook configuration is absent", async t => {
  environment(t, { STRIPE_SECRET_KEY: "sk_test_isolated", STRIPE_WEBHOOK_SECRET: "whsec_test" });
  t.mock.method(pool, "query", () => { throw new Error("Unexpected database access"); });
  const req = { headers: {}, body: Buffer.from('{"type":"checkout.session.completed"}') };
  const res = response();
  await handleStripeWebhook(req, res);
  assert.equal(res.statusCode, 400);
  assert.equal(res.body, "signature_required");
  delete process.env.STRIPE_WEBHOOK_SECRET;
  const unconfigured = response();
  await handleStripeWebhook(req, unconfigured);
  assert.equal(unconfigured.statusCode, 503);
});

test("Stripe accepts an authentic signed event without making network calls", async t => {
  environment(t, { STRIPE_SECRET_KEY: "sk_test_isolated", STRIPE_WEBHOOK_SECRET: "whsec_test" });
  const body = JSON.stringify({ id: "evt_test", type: "test.ignored", data: { object: {} } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: "whsec_test" });
  const res = response();
  await handleStripeWebhook({ headers: { "stripe-signature": signature }, body: Buffer.from(body) }, res);
  assert.deepEqual(res.body, { received: true });
});

test("WhatsApp checks the exact raw body and fails closed", t => {
  environment(t, { WHATSAPP_APP_SECRET: "test-secret" });
  const rawBody = Buffer.from('{ "entry": [] }');
  const signature = "sha256=" + crypto.createHmac("sha256", "test-secret").update(rawBody).digest("hex");
  let accepted = 0;
  verifyWhatsappWebhook({ rawBody, headers: { "x-hub-signature-256": signature } }, response(), () => accepted++);
  assert.equal(accepted, 1);
  for (const req of [
    { rawBody: Buffer.from('{}'), headers: { "x-hub-signature-256": signature } },
    { rawBody, headers: {} },
    { rawBody, headers: { "x-hub-signature-256": "sha256=invalid" } }
  ]) {
    const res = response();
    verifyWhatsappWebhook(req, res, () => accepted++);
    assert.equal(res.statusCode, 401);
  }
  assert.equal(accepted, 1);
  delete process.env.WHATSAPP_APP_SECRET;
  const res = response();
  verifyWhatsappWebhook({ rawBody, headers: {} }, res, () => accepted++);
  assert.equal(res.statusCode, 503);
});

for (const method of ["post", "put"]) {
  for (const field of ["prospectId", "clientId", "quoteId", "invoiceId"]) {
    test(`pipeline ${method} rejects a foreign ${field} before writing`, async t => {
      const queries = [];
      t.mock.method(pool, "query", async (sql, params) => {
        queries.push({ sql, params });
        assert.match(sql, /AS allowed/);
        assert.equal(params[0], 10);
        assert.ok(params.includes(999));
        return { rows: [{ allowed: false }] };
      });
      const path = method === "post" ? "/opportunities" : "/opportunities/:id";
      const route = pipeline.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route;
      const res = response();
      await route.stack.at(-1).handle({ user: { id: 1, agencyId: 10 }, params: { id: "1" }, body: { title: "Test", [field]: 999 } }, res, error => { throw error; });
      assert.equal(res.statusCode, 404);
      assert.equal(queries.length, 1);
    });
  }
}

test("repeating a prospect conversion reuses its existing client", async t => {
  const calls = [];
  const connection = { release() {}, async query(sql) {
    calls.push(sql);
    if (sql.includes("FROM prospects")) return { rows: [{ id: 1, converted_client_id: 4 }] };
    if (sql.includes("FROM clients")) return { rows: [{ id: 4 }] };
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(sql)) return { rows: [] };
    throw new Error("Unexpected write");
  } };
  t.mock.method(pool, "connect", async () => connection);
  const route = pipeline.stack.find(layer => layer.route?.path === "/prospects/:id/convert-to-client").route;
  const res = response();
  await route.stack.at(-1).handle({ user: { id: 1, agencyId: 10 }, params: { id: "1" } }, res, error => { throw error; });
  assert.deepEqual(res.body, { clientId: 4 });
  assert.ok(!calls.some(sql => sql.includes("INSERT")));
});
