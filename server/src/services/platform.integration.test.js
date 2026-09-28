import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import express from "express";
import pool from "../db.js";
import router from "../routes/platform.js";
import analytics from "../routes/analytics.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { createAuthToken } from "../utils/authToken.js";
import { analyticsReport } from "./googleAnalytics.js";

test("PostgreSQL/HTTP: platform ownership, safe administration, tenant reads and GA4 settings",{skip:!process.env.TEST_DATABASE_URL},async t=>{
  const db=new pg.Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
  const admins=process.env.SUPER_ADMIN_EMAILS;process.env.SUPER_ADMIN_EMAILS="owner@example.test";
  let server;
  try{
    const schema=await readFile(new URL("../../sql/schema.sql",import.meta.url),"utf8");
    await db.query(schema.replaceAll("CREATE TABLE IF NOT EXISTS","CREATE TEMP TABLE IF NOT EXISTS"));
    for(const file of ["2026-09-27-welcome-guide.sql","2026-09-27-user-avatar.sql","2026-09-27-mandatory-mfa.sql","2026-09-28-platform-console.sql"]){
      await db.query((await readFile(new URL("../../sql/migrations/"+file,import.meta.url),"utf8")).replace(/CREATE TABLE /g,"CREATE TEMP TABLE "));
    }
    await db.query("INSERT INTO agencies(name,slug,subscription_status,plan_tier) VALUES('Owner','owner','active','premium'),('Other','other','active','pro'),('Stripe','stripe','trial','pro'); UPDATE agencies SET stripe_subscription_id='sub_fixture' WHERE id=3");
    await db.query("INSERT INTO users(agency_id,full_name,email,password_hash,role,mfa_enabled,mfa_version) VALUES(1,'Owner','owner@example.test','fixture','admin',true,1),(2,'Manager','manager@example.test','fixture','admin',true,1),(2,'Sales','sales@example.test','fixture','commercial',true,1)");
    await db.query("INSERT INTO clients(agency_id,name,email) VALUES(1,'Own contact','own@example.test'),(2,'Other contact','other@example.test'); INSERT INTO agency_settings(agency_id,agency_name,currency) VALUES(1,'Owner','CAD'),(2,'Other','USD')");
    t.mock.method(pool,"query",(sql,params)=>db.query(sql,params));
    t.mock.method(pool,"connect",async()=>({query:(sql,params)=>db.query(sql,params),release(){}}));
    const app=express();app.use(express.json());app.use("/api/platform",router);app.use("/api/analytics",analytics);app.get("/api/clients",requireAuth,(req,res)=>res.json({ok:true}));app.use((error,req,res,next)=>res.status(500).json({message:error.message}));
    server=app.listen(0,"127.0.0.1");await new Promise(resolve=>server.once("listening",resolve));
    const url=`http://127.0.0.1:${server.address().port}/api`;
    const token=id=>createAuthToken({id,agency_id:id===1?1:2,role:id===3?"commercial":"admin",email:id===1?"owner@example.test":"other@example.test",mfa_version:1},{mfaVerified:true});
    async function call(path,{method="GET",body,access=token(1)}={}){const response=await fetch(url+path,{method,headers:{"Content-Type":"application/json",Authorization:`Bearer ${access}`},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
    assert.equal((await call("/platform/agencies",{access:token(2)})).status,403);
    const list=await call("/platform/agencies?search=Other");assert.equal(list.status,200);assert.equal(list.data.items.length,1);assert.equal(list.data.items[0].id,2);
    const contacts=await call("/platform/agencies/2/clients");assert.equal(contacts.data.items.length,1);assert.equal(contacts.data.items[0].title,"Other contact");
    const users=await call("/platform/agencies/2/users");assert.ok(users.data.items.every(row=>!Object.hasOwn(row,"password_hash")&&!Object.hasOwn(row,"mfa_secret")));
    const details=await call("/platform/agencies/2/users/2");assert.equal(details.status,200);assert.equal(details.data.record.email,"manager@example.test");assert.equal(details.data.record.password_hash,undefined);
    assert.equal((await call("/platform/agencies/1/clients/2")).status,404);
    assert.equal((await call("/platform/agencies/2/__proto__")).status,400);
    const change=(path,body)=>call(path,{method:"PATCH",body:{reason:"Opération de test encadrée",...body}});
    assert.equal((await change("/platform/users/1",{isActive:false})).status,409);
    assert.equal((await change("/platform/users/2",{role:"readonly"})).status,409);
    assert.equal((await change("/platform/users/3",{isActive:false})).status,200);
    assert.equal((await call("/clients",{access:token(3)})).status,401);
    assert.equal((await change("/platform/agencies/1",{isSuspended:true})).status,409);
    assert.equal((await change("/platform/agencies/3",{planTier:"premium"})).status,409);
    assert.equal((await change("/platform/agencies/2",{isSuspended:true})).status,200);
    assert.equal((await call("/clients",{access:token(2)})).status,403);
    assert.equal((await change("/platform/agencies/2",{isSuspended:false,planTier:"premium"})).status,200);
    assert.equal((await call("/clients",{access:token(2)})).status,200);
    const audit=await call("/platform/actions");assert.ok(audit.data.items.some(row=>row.action==="ADMIN_UPDATE"&&row.metadata.reason));
    const overview=await call("/platform/overview");assert.equal(overview.status,200);assert.equal(overview.data.metrics.totalAgencies,3);assert.equal(overview.data.metrics.activeSubscriptions,2);
    const ga={enabled:true,measurementId:"G-ABCDEF1234",propertyId:"123456789",reason:"Configuration de test GA4",manualMeasurementConfirmed:true};
    assert.equal((await call("/platform/analytics/config",{method:"PUT",body:{...ga,manualMeasurementConfirmed:false}})).status,400);
    assert.equal((await call("/platform/analytics/config",{method:"PUT",body:ga})).status,200);
    const publicConfig=await call("/analytics/config");assert.equal(publicConfig.data.measurementId,ga.measurementId);assert.equal(publicConfig.data.propertyId,undefined);assert.equal(publicConfig.data.credentialsConfigured,undefined);
    const google=await analyticsReport(7,async body=>body.dimensions?{rows:[]}:{rows:[{metricValues:[{value:"10"},{value:"12"},{value:"25"},{value:"0.5"}]}]});
    // Injection exercises report parsing without contacting Google or requiring a real secret file.
    assert.equal(google.configured,true);assert.equal(google.metrics.users,10);assert.equal(google.metrics.engagementRate,0.5);
    assert.equal((await call("/platform/analytics/report",{access:token(2)})).status,403);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await db.end();if(admins===undefined)delete process.env.SUPER_ADMIN_EMAILS;else process.env.SUPER_ADMIN_EMAILS=admins;}
});
