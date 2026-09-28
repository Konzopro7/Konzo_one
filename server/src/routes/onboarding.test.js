import test from "node:test";
import assert from "node:assert/strict";
import pool from "../db.js";
import router from "./auth.js";

const handler = (path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("welcome preference updates only the authenticated user and agency, ignoring supplied IDs", async (t) => {
  const calls = [];
  t.mock.method(pool, "query", async (sql, params) => {
    calls.push({ sql, params });
    return { rows: [{ id: 7 }] };
  });
  const req = { user: { id: 7, agencyId: 3 }, body: { userId: 99, agencyId: 88 } };
  for (let i = 0; i < 2; i++) {
    const res = response();
    await handler("/onboarding", "put")(req, res, error => { throw error; });
    assert.deepEqual(res.body, { needsWelcomeGuide: false });
  }
  assert.ok(calls.every(call => call.sql.includes("id = $1 AND agency_id = $2")));
  assert.deepEqual(calls.map(call => call.params), [[7, 3], [7, 3]]);
});

test("welcome state is returned by the existing profile endpoint without exposing database fields", async (t) => {
  let status = "pending";
  t.mock.method(pool, "query", async () => ({ rows: [{ id: 7, agency_id: 3, is_active: true, role: "readonly", onboarding_status: status }] }));
  for (const expected of [true, false, false]) {
    const res = response();
    await handler("/me", "get")({ user: { id: 7 } }, res, error => { throw error; });
    assert.equal(res.body.user.needsWelcomeGuide, expected);
    assert.equal(res.body.user.onboarding_status, undefined);
    status = status === "pending" ? "seen" : "existing";
  }
});

test("failed onboarding saves propagate the error rather than pretending the guide was seen", async (t) => {
  const failure = new Error("database offline");
  t.mock.method(pool, "query", async () => { throw failure; });
  let received;
  const res = response();
  await handler("/onboarding", "put")({ user: { id: 7, agencyId: 3 } }, res, error => { received = error; });
  assert.equal(received, failure);
  assert.equal(res.body, undefined);
});
