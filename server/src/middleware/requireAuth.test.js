import test from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import pool from "../db.js";
import { getJwtSecret } from "../utils/jwtSecret.js";
import { requireAuth } from "./requireAuth.js";
import { requireRole } from "./requireRole.js";

const account = { id: 1, agency_id: 10, role: "readonly", email: "current@example.test", is_active: true, mfa_enabled: true, mfa_version: 1 };
const agency = { plan_tier: "pro", subscription_status: "active" };

async function authenticate(t, { claims = { userId: 1, agencyId: 10, role: "admin", email: "old@example.test", purpose: "access", mfaVerified: true, mfaVersion: 1 }, user = account, failure, token, subscription = agency, baseUrl = "/api/clients", path = "/" } = {}) {
  const queries = [];
  let currentSubscription = { ...subscription };
  t.mock.method(pool, "query", async (sql, params) => {
    queries.push({ sql, params });
    if (failure) throw failure;
    if (sql.includes("FROM users")) return { rows: user ? [user] : [] };
    if (sql.includes("FROM agencies")) return { rows: [currentSubscription] };
    if (sql.includes("WITH expired")) {
      currentSubscription.subscription_status = "past_due";
      return { rows: [{ agency_id: 10 }] };
    }
    throw new Error("Unexpected query in authentication test");
  });
  const req = {
    headers: { authorization: `Bearer ${token ?? jwt.sign(claims, getJwtSecret(), { expiresIn: "1h" })}` },
    baseUrl, path
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

test("an inactive subscription can save the welcome preference", async t => {
  const result = await authenticate(t, { subscription: { subscription_status: "past_due" }, baseUrl: "/api/auth", path: "/onboarding" });
  assert.equal(result.nextCalled, true);
  assert.equal(result.res.statusCode, 200);
});

test("welcome preference exemption does not unlock other routes", async t => {
  const result = await authenticate(t, { subscription: { subscription_status: "past_due" }, baseUrl: "/api/auth", path: "/onboarding/other" });
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 402);
});

for (const [name, trialEndsAt] of [["ended", new Date(Date.now()-1000).toISOString()], ["missing date", null]]) {
  test(`a trial with ${name} immediately blocks business APIs even with a valid existing JWT`, async t => {
    const result = await authenticate(t, { subscription: { subscription_status: "trial", trial_ends_at: trialEndsAt } });
    assert.equal(result.res.statusCode, 402);
    assert.equal(result.res.body.code, "SUBSCRIPTION_REQUIRED");
    assert.equal(result.req.user.subscription.subscriptionStatus, "past_due");
    assert.equal(result.nextCalled, false);
  });
}
test("an expired trial can still reach subscription checkout", async t => {
  const result = await authenticate(t, { subscription: { subscription_status: "trial", trial_ends_at: new Date(0) }, baseUrl: "/api/billing", path: "/checkout-session" });
  assert.equal(result.res.statusCode, 200);
  assert.equal(result.nextCalled, true);
});

test("suspended workspaces lose business access without preventing account recovery", async t => {
  const result=await authenticate(t,{subscription:{...agency,is_suspended:true}});
  assert.equal(result.res.statusCode,403);
  assert.equal(result.res.body.code,"WORKSPACE_SUSPENDED");
});
test("suspended workspaces can access the profile but stay marked as suspended",async t=>{
  const result=await authenticate(t,{subscription:{...agency,is_suspended:true},baseUrl:"/api/auth",path:"/me"});
  assert.equal(result.nextCalled,true);
  assert.equal(result.req.user.subscription.isSuspended,true);
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

test("legacy tokens cannot bypass mandatory MFA, even on the me route", async (t) => {
  const result = await authenticate(t, { claims: { userId: 1 } });
  assert.equal(result.nextCalled, false);
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.res.body.code, "MFA_REQUIRED");
});

for (const [name, claims, user] of [
  ["password-only", { purpose: "access", mfaVerified: false, mfaVersion: 1 }, account],
  ["outdated factor", { purpose: "access", mfaVerified: true, mfaVersion: 0 }, account],
  ["unenrolled", { purpose: "access", mfaVerified: true, mfaVersion: 1 }, { ...account, mfa_enabled: false }],
  ["wrong purpose", { purpose: "challenge", mfaVerified: true, mfaVersion: 1 }, account]
]) test(`${name} cannot use an access token`, async t => {
  const result = await authenticate(t, { claims: { userId: 1, agencyId: 10, ...claims }, user, baseUrl: "/api/auth", path: "/me" });
  assert.equal(result.res.statusCode, 401);
  assert.equal(result.nextCalled, false);
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
