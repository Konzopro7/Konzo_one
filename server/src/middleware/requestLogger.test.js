import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import pool from "../db.js";
import { requestLogger } from "./requestLogger.js";

test("request logs redact portal tokens and query secrets and ignore spoofed forwarded IPs", async t => {
  const calls = [];
  t.mock.method(pool,"query",async (sql,params) => { calls.push({sql,params}); return {rows:[]}; });
  const req = { originalUrl:"/api/portal/quotes/private-token/pdf?secret=private",method:"GET",headers:{"x-forwarded-for":"spoofed"},socket:{remoteAddress:"127.0.0.1"} };
  const res = new EventEmitter(); res.statusCode = 200;
  requestLogger(req,res,() => {}); res.emit("finish");
  assert.equal(calls.length,1);
  assert.equal(calls[0].params[3],"/api/portal/quotes/[redacted]/pdf");
  assert.equal(calls[0].params[6],"127.0.0.1");
});
test("preauthentication logging records identity without generic mutation logs or credentials", async t => {
  const calls = [];
  t.mock.method(pool,"query",async (sql,params) => { calls.push({sql,params}); return {rows:[]}; });
  const req = {originalUrl:"/api/auth/mfa/verify",method:"POST",authActor:{id:1,agencyId:2},headers:{},body:{code:"sensitive"},socket:{remoteAddress:"127.0.0.1"}};
  const res = new EventEmitter(); res.statusCode=401;
  requestLogger(req,res,() => {}); res.emit("finish");
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0].params.slice(0,2),[2,1]);
  assert.ok(!JSON.stringify(calls).includes("sensitive"));
});
