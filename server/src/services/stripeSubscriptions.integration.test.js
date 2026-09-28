import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import Stripe from "stripe";
import pool from "../db.js";
import { expireTrials } from "./subscriptionExpiry.js";
import { getStripeClient } from "./stripeClient.js";
import { confirmStripeCheckout } from "./stripeSubscriptions.js";
import { handleStripeWebhook } from "../routes/payments.js";

test("PostgreSQL: trial expiry, paid Stripe activation, tenant scope and idempotent webhooks", { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const db = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
  await db.connect();
  const keys = ['STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET','STRIPE_PRICE_PRO_MONTHLY','STRIPE_MODE'];
  const before = Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture',STRIPE_PRICE_PRO_MONTHLY:'price_pro',STRIPE_MODE:'test'});
  try {
    await db.query(`CREATE TEMP TABLE agencies(id INT PRIMARY KEY,subscription_status TEXT,trial_ends_at TIMESTAMP,updated_at TIMESTAMP DEFAULT NOW(),plan_tier TEXT,
      stripe_customer_id TEXT UNIQUE,stripe_subscription_id TEXT UNIQUE,subscription_started_at TIMESTAMP,subscription_ends_at TIMESTAMP);
      CREATE TEMP TABLE audit_logs(agency_id INT,action TEXT,entity_type TEXT,entity_id INT,metadata JSONB);
      CREATE TEMP TABLE users(id INT,agency_id INT,is_active BOOLEAN);
      INSERT INTO agencies(id,subscription_status,trial_ends_at,plan_tier,stripe_customer_id) VALUES
      (1,'trial',NOW()-INTERVAL '1 second','pro','cus_one'),(2,'trial',NOW()+INTERVAL '10 days','pro','cus_two'),
      (3,'active',NOW()-INTERVAL '100 days','pro','cus_three'),(4,'trial',NULL,'pro','cus_four');
      INSERT INTO users VALUES (11,1,true),(12,2,true);`);
    await db.query((await readFile(new URL('../../sql/migrations/2026-09-28-stripe-webhook-events.sql',import.meta.url),'utf8')).replace('CREATE TABLE','CREATE TEMP TABLE'));
    t.mock.method(pool,'query',(sql,params)=>db.query(sql,params));
    t.mock.method(pool,'connect',async()=>({query:(sql,params)=>db.query(sql,params),release(){}}));
    assert.equal(await expireTrials(),2);
    assert.equal(await expireTrials(),0);
    assert.deepEqual((await db.query('SELECT subscription_status FROM agencies ORDER BY id')).rows.map(r=>r.subscription_status),['past_due','trial','active','past_due']);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM audit_logs')).rows[0].n,2);
    assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM users WHERE is_active')).rows[0].n,2);
    const end = Math.floor(Date.now()/1000)+29*86400;
    let subscription={id:'sub_one',customer:'cus_one',status:'active',metadata:{agencyId:'1'},items:{data:[{price:{id:'price_pro'},current_period_start:end-30*86400,current_period_end:end}]}};
    let retrievalFailure=false;
    t.mock.method(getStripeClient().subscriptions,'retrieve',async()=>{if(retrievalFailure) throw Error('temporary Stripe outage');return subscription;});
    const session={id:'cs_fixture',mode:'subscription',status:'complete',payment_status:'unpaid',customer:'cus_one',subscription:'sub_one',metadata:{agencyId:'1'}};
    await assert.rejects(confirmStripeCheckout(session,1),{status:409});
    session.payment_status='paid';
    await assert.rejects(confirmStripeCheckout(session,2),{status:409});
    const updated=await confirmStripeCheckout(session,1);
    assert.equal(updated.subscription_status,'active');
    assert.equal(updated.subscription_ends_at.getTime(),end*1000);
    async function deliver(id,type,object,livemode=false){
      const body=JSON.stringify({id,type,livemode,data:{object}});
      const signature=Stripe.webhooks.generateTestHeaderString({payload:body,secret:'whsec_fixture'});
      const res={statusCode:200,status(n){this.statusCode=n;return this;},json(value){this.body=value;return this;},send(value){this.body=value;return this;}};
      await handleStripeWebhook({body:Buffer.from(body),headers:{'stripe-signature':signature}},res);
      return res;
    }
    subscription={...subscription,status:'canceled'};
    assert.equal((await deliver('evt_cancel','customer.subscription.deleted',{id:'sub_one'})).statusCode,200);
    assert.equal((await db.query('SELECT subscription_status FROM agencies WHERE id=1')).rows[0].subscription_status,'canceled');
    subscription={...subscription,status:'active'};
    await deliver('evt_cancel','customer.subscription.deleted',{id:'sub_one'});
    assert.equal((await db.query('SELECT subscription_status FROM agencies WHERE id=1')).rows[0].subscription_status,'canceled');
    assert.equal((await deliver('evt_live','customer.subscription.updated',{id:'sub_one'},true)).statusCode,400);
    retrievalFailure=true;
    assert.equal((await deliver('evt_retry','customer.subscription.updated',{id:'sub_one'})).statusCode,500);
    assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM stripe_webhook_events WHERE id='evt_retry'")).rows[0].n,0);
    retrievalFailure=false;
    await deliver('evt_retry','customer.subscription.updated',{id:'sub_one'});
    assert.equal((await db.query('SELECT subscription_status FROM agencies WHERE id=1')).rows[0].subscription_status,'active');
    // A stale subscription from the same customer must not overwrite a replacement.
    subscription={...subscription,id:'sub_old',status:'canceled'};
    await deliver('evt_old','customer.subscription.deleted',{id:'sub_old'});
    assert.equal((await db.query('SELECT subscription_status FROM agencies WHERE id=1')).rows[0].subscription_status,'active');
    subscription={...subscription,status:'active'};
    await assert.rejects(confirmStripeCheckout({...session,subscription:'sub_old'},1));
    assert.equal((await db.query('SELECT stripe_subscription_id FROM agencies WHERE id=1')).rows[0].stripe_subscription_id,'sub_one');
    assert.equal((await db.query('SELECT subscription_status FROM agencies WHERE id=2')).rows[0].subscription_status,'trial');
  } finally {
    for(const key of keys) { if(before[key]===undefined) delete process.env[key];else process.env[key]=before[key]; }
    await db.end();
  }
});
