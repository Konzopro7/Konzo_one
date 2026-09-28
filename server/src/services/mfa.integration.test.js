import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import pg from "pg";
import express from "express";
import bcrypt from "bcryptjs";
import { generate } from "otplib";
import { readFile } from "node:fs/promises";
import pool from "../db.js";
import auth from "../routes/auth.js";
import audit from "../routes/audit.js";
import platform from "../routes/platform.js";

test("PostgreSQL/HTTP: mandatory MFA, enrollment, replay, recovery, lockout and tenant audit", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const previous = { key: process.env.MFA_ENCRYPTION_KEY, admins: process.env.SUPER_ADMIN_EMAILS };
  process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  process.env.SUPER_ADMIN_EMAILS = "owner@example.test";
  let listener;
  try {
    // All fixtures shadow real tables on this private connection and vanish at disconnect.
    await db.query(`CREATE TEMP TABLE agencies (id SERIAL PRIMARY KEY,name TEXT,slug TEXT,plan_tier TEXT DEFAULT 'pro',subscription_status TEXT DEFAULT 'active',trial_ends_at TIMESTAMP,subscription_started_at TIMESTAMP,subscription_ends_at TIMESTAMP);
      CREATE TEMP TABLE users (id SERIAL PRIMARY KEY,agency_id INT REFERENCES agencies(id),full_name TEXT,email TEXT UNIQUE,password_hash TEXT,role TEXT,is_active BOOLEAN DEFAULT true,onboarding_status TEXT DEFAULT 'pending',avatar_url TEXT);
      CREATE TEMP TABLE agency_settings (agency_id INT,agency_name TEXT,agency_email TEXT);
      CREATE TEMP TABLE audit_logs (id SERIAL PRIMARY KEY,agency_id INT,user_id INT,action VARCHAR(20),entity_type TEXT,entity_id INT,path TEXT,status_code INT,metadata JSONB,created_at TIMESTAMP DEFAULT NOW());
      INSERT INTO agencies(name,slug) VALUES ('Agency A','a'),('Agency B','b');`);
    const password = "Fixture-password-982!";
    const passwordHash = await bcrypt.hash(password,4);
    await db.query("INSERT INTO users(agency_id,full_name,email,password_hash,role) VALUES (1,'Owner','owner@example.test',$1,'admin'),(2,'Other','other@example.test',$1,'admin')", [passwordHash]);
    const migration = await readFile(new URL("../../sql/migrations/2026-09-27-mandatory-mfa.sql",import.meta.url),"utf8");
    await db.query(migration.replace("CREATE TABLE auth_challenges", "CREATE TEMP TABLE auth_challenges"));
    assert.equal((await db.query("SELECT COUNT(*)::INT AS n FROM users WHERE mfa_enabled=false")).rows[0].n,2);
    t.mock.method(pool,"query",(sql,params) => db.query(sql,params));
    t.mock.method(pool,"connect",async () => ({ query: (sql,params) => db.query(sql,params), release() {} }));
    const app = express(); app.use(express.json()); app.use("/api/auth",auth); app.use("/api/audit",audit); app.use("/api/platform",platform);
    app.use((error,req,res,next) => { res.status(500).json({ message: "Test API error", detail: error.message }); });
    listener = app.listen(0,"127.0.0.1"); await new Promise(resolve => listener.once("listening",resolve));
    const url = `http://127.0.0.1:${listener.address().port}/api`;
    async function post(path,body) { const response = await fetch(url+path,{ method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body) }); return { status:response.status,data:await response.json() }; }
    async function get(path,token) { const response = await fetch(url+path,{ headers:{ Authorization:`Bearer ${token}` } }); return { status:response.status,data:await response.json() }; }
    const login = () => post("/auth/login",{ email:"owner@example.test",password });
    const challenge = (await login()).data;
    assert.equal(challenge.enrollmentRequired,true); assert.equal(challenge.token,undefined); assert.equal(challenge.user,undefined);
    assert.equal((await get("/auth/me",challenge.challengeToken)).status,401);
    const setup = (await post("/auth/mfa/setup",challenge)).data;
    const repeated = (await post("/auth/mfa/setup",challenge)).data;
    assert.ok(setup.secret === repeated.secret); assert.ok(setup.qrCode.startsWith("data:image/png;base64,"));
    assert.equal((await db.query("SELECT mfa_enabled FROM users WHERE id=1")).rows[0].mfa_enabled,false);
    const code = await generate({ secret:setup.secret });
    const success = await post("/auth/mfa/verify",{ ...challenge,code });
    assert.equal(success.status,200); assert.equal(success.data.recoveryCodes.length,10);
    assert.equal(success.data.user.mfa_secret,undefined); assert.equal(success.data.user.password_hash,undefined);
    assert.equal(success.data.user.mfaEnabled,true);
    assert.equal((await get("/auth/me",success.data.token)).status,200);
    assert.equal((await post("/auth/mfa/verify",{ ...challenge,code })).status,401);
    const second = (await login()).data;
    assert.equal(second.enrollmentRequired,false);
    assert.equal((await post("/auth/mfa/setup",second)).status,409);
    assert.equal((await post("/auth/mfa/verify",{ ...second,code })).status,401);
    const recovery = success.data.recoveryCodes[0];
    const recovered = await post("/auth/mfa/verify",{ ...second,code:recovery });
    assert.equal(recovered.status,200); assert.equal(recovered.data.recoveryCodes,undefined);
    const third = (await login()).data;
    assert.equal((await post("/auth/mfa/verify",{ ...third,code:recovery })).status,401);
    assert.equal((await db.query("SELECT cardinality(mfa_recovery_hashes) AS n FROM users WHERE id=1")).rows[0].n,9);
    await db.query("UPDATE auth_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE consumed=false");
    assert.equal((await post("/auth/mfa/verify",{ ...third,code:success.data.recoveryCodes[1] })).status,401);
    // Fresh challenges must not reset account-level failure counts.
    await db.query("UPDATE users SET mfa_failures=0 WHERE id=1");
    for (let i=0;i<5;i++) assert.equal((await post("/auth/mfa/verify",{ ...(await login()).data,code:"badbad" })).status,401);
    assert.equal((await post("/auth/mfa/verify",{ ...(await login()).data,code:success.data.recoveryCodes[1] })).status,429);
    await db.query("UPDATE users SET mfa_blocked_until=NOW()-INTERVAL '1 second' WHERE id=1");
    assert.equal((await post("/auth/mfa/verify",{ ...(await login()).data,code:success.data.recoveryCodes[1] })).status,200);
    await db.query("INSERT INTO audit_logs(agency_id,user_id,action,entity_type,status_code) VALUES (2,2,'AUTH_OK','authentication',200)");
    const own = await get("/audit/security",success.data.token);
    assert.equal(own.status,200); assert.ok(own.data.items.every(row => row.agencyName !== "Agency B"));
    const all = await get("/platform/security",success.data.token);
    assert.ok(all.data.items.some(row => row.agencyName === "Agency B"));
    const failures = await get("/audit/security?result=failure&search=Owner",success.data.token);
    assert.ok(failures.data.items.length>0); assert.ok(failures.data.items.every(row => !row.success));
    const registered = await post("/auth/register",{ agencyName:"New Agency",fullName:"New User",email:"new@example.test",password });
    assert.equal(registered.status,201); assert.equal(registered.data.enrollmentRequired,true); assert.equal(registered.data.token,undefined);
    await db.query("UPDATE users SET role='readonly' WHERE id=1");
    assert.equal((await get("/audit/security",success.data.token)).status,403);
    process.env.SUPER_ADMIN_EMAILS = "other@example.test";
    assert.equal((await get("/platform/security",success.data.token)).status,403);
  } finally {
    if (listener) await new Promise(resolve => listener.close(resolve));
    await db.end();
    if (previous.key === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = previous.key;
    if (previous.admins === undefined) delete process.env.SUPER_ADMIN_EMAILS; else process.env.SUPER_ADMIN_EMAILS = previous.admins;
  }
});
