import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { getJwtSecret } from "../utils/jwtSecret.js";
import { requireAuth } from "./requireAuth.js";
import { requireRole } from "./requireRole.js";

const account = { id: 1, agency_id: 10, role: "readonly", email: "current@example.test", is_active: true };
const agency = { plan_tier: "pro", subscription_status: "active" };

async function authenticate(t, { claims = { userId: 1, agencyId: 10, role: "admin", email: "old@example.test" }, user = account, failure, token } = {}) {
  const queries = [];
  t.mock.method(pool, "query", async (sql, params) => {
    queries.push({ sql, params });
    if (failure) throw failure;
    if (sql.includes("FROM users")) return { rows: user ? [user] : [] };
    if (sql.includes("FROM agencies")) return { rows: [agency] };
    throw new Error("Unexpected query in authentication test");
  });
  const req = {
    headers: { authorization: `Bearer ${token ?? jwt.sign(claims, getJwtSecret(), { expiresIn: "1h" })}` },
    baseUrl: "/api/clients", path: "/"
  };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let nextCalled = false;
  let nextError;
  await requireAuth(req, res, (error) => { nextCalled = true; nextError = error; });
  return { req, res, queries, nextCalled, nextError };
}

test("a downgraded user immediately loses admin permissions despite an old token", async (t) => {
  const result = await authenticate(t);
  assert.equal(result.nextCalled, true);
  assert.equal(result.nextError, undefined);
  assert.equal(result.req.user.role, "readonly");
  assert.equal(result.req.user.email, "current@example.test");
  let permitted = false;
  requireRole("admin")(result.req, result.res, () => { permitted = true; });
  assert.equal(permitted, false);
  assert.equal(result.res.statusCode, 403);
});

for (const [name, user] of [["disabled", { ...account, is_active: false }], ["deleted", null]]) {
  test(`${name} users cannot reuse a valid JWT`, async (t) => {
    const result = await authenticate(t, { user });
    assert.equal(result.res.statusCode, 401);
    assert.equal(result.nextCalled, false);
    assert.equal(result.queries.length, 1);
    assert.equal(result.req.user, undefined);
  });
}

test("a token for a former agency is rejected", async (t) => {
  const result = await authenticate(t, { claims: { userId: 1, agencyId: 99, role: "admin" } });
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalled, false);
});

test("legacy tokens use the active account's current agency and role", async (t) => {
  const result = await authenticate(t, { claims: { userId: 1 } });
  assert.equal(result.nextCalled, true);
  assert.equal(result.req.user.agencyId, 10);
  assert.equal(result.req.user.role, "readonly");
  assert.deepEqual(result.queries[1].params, [10]);
});

test("database failures reach the server error handler instead of becoming invalid credentials", async (t) => {
  const failure = new Error("Database unavailable");
  const result = await authenticate(t, { failure });
  assert.equal(result.nextError, failure);
  assert.equal(result.res.body, undefined);
});

test("malformed tokens are rejected before querying the database", async (t) => {
  const result = await authenticate(t, { token: "invalid-token" });
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.queries.length, 0);
});

test("expired tokens are rejected before querying the database", async (t) => {
  const token = jwt.sign({ userId: 1 }, getJwtSecret(), { expiresIn: -1 });
  const result = await authenticate(t, { token });
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.queries.length, 0);
});
