import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import pool from "../db.js";
import { getStripeClient } from "./stripeClient.js";
import {
  newsletterStatus,
  subscribeNewsletter,
  newsletterTokenAction,
  newsletterCheckoutDiscount,
  unsubscribeNewsletter,
} from "./newsletter.js";

test(
  "PostgreSQL: newsletter opt-in, scoped confirmation, withdrawal and first-month discount limits",
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await db.connect();
    const keys = [
      "SMTP_HOST",
      "SMTP_USER",
      "SMTP_PASS",
      "PUBLIC_CLIENT_URL",
      "STRIPE_SECRET_KEY",
      "STRIPE_MODE",
    ];
    const original = Object.fromEntries(
      keys.map((key) => [key, process.env[key]]),
    );
    Object.assign(process.env, {
      SMTP_HOST: "smtp.fixture.invalid",
      SMTP_USER: "fixture",
      SMTP_PASS: "fixture",
      PUBLIC_CLIENT_URL: "https://crm.example.test",
      STRIPE_SECRET_KEY: "sk_test_fixture",
      STRIPE_MODE: "test",
    });
    try {
      await db.query(`CREATE TEMP TABLE agencies(id INT PRIMARY KEY,subscription_started_at TIMESTAMPTZ,stripe_subscription_id TEXT,subscription_status TEXT);
      CREATE TEMP TABLE platform_settings(id INT PRIMARY KEY);
      CREATE TEMP TABLE users(id INT PRIMARY KEY,agency_id INT REFERENCES agencies(id),email TEXT,is_active BOOLEAN);
      CREATE TEMP TABLE audit_logs(agency_id INT,user_id INT,action VARCHAR(20),entity_type TEXT,entity_id INT,path TEXT,status_code INT,metadata JSONB);
      INSERT INTO agencies VALUES(1,NULL,NULL,'trial'),(2,NULL,NULL,'trial'),(3,NOW(),'sub_existing','active');
      INSERT INTO users VALUES(11,1,'one@example.test',true),(22,2,'two@example.test',true),(33,3,'old@example.test',true);`);
      const migration = await readFile(
        new URL(
          "../../sql/migrations/2026-09-28-newsletter.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.query(
        migration.replace(
          "CREATE TABLE newsletter_subscriptions",
          "CREATE TEMP TABLE newsletter_subscriptions",
        ),
      );
      t.mock.method(pool, "query", (sql, params) => db.query(sql, params));
      t.mock.method(pool, "connect", async () => ({
        query: (sql, params) => db.query(sql, params),
        release() {},
      }));
      const user = { id: 11, agencyId: 1, email: "one@example.test" },
        req = { ip: "127.0.0.1", headers: {} };
      let email;
      assert.equal((await newsletterStatus(user)).discountReady, false);
      await subscribeNewsletter(user, req, async (payload) => {
        email = payload;
      });
      assert.equal(email.to, user.email);
      const confirmation = email.html.match(
        /\/confirm#token=([a-f0-9]{64})/,
      )[1];
      const unsubscribe = email.html.match(
        /\/unsubscribe#token=([a-f0-9]{64})/,
      )[1];
      assert.equal((await newsletterStatus(user)).status, "pending");
      assert.equal(await newsletterCheckoutDiscount(1, "price_monthly"), null);
      assert.equal(
        (
          await db.query(
            "SELECT confirmation_hash FROM newsletter_subscriptions",
          )
        ).rows[0].confirmation_hash.includes(confirmation),
        false,
      );
      await assert.rejects(
        subscribeNewsletter(user, req, async () => {}),
        { status: 429 },
      );
      await assert.rejects(
        newsletterTokenAction("f".repeat(64), "confirm", req),
        { status: 400 },
      );
      await newsletterTokenAction(confirmation, "confirm", req);
      await assert.rejects(
        newsletterTokenAction(confirmation, "confirm", req),
        { status: 400 },
      );
      assert.equal((await newsletterStatus(user)).discountReady, true);
      assert.equal(
        (
          await newsletterStatus({
            id: 22,
            agencyId: 2,
            email: "two@example.test",
          })
        ).discountReady,
        false,
      );
      const stripe = getStripeClient();
      let created = 0,
        used = false,
        interval = "month";
      t.mock.method(stripe.prices, "retrieve", async () => ({
        recurring: { interval, interval_count: 1 },
      }));
      t.mock.method(stripe.coupons, "retrieve", async (id) => {
        if (!created) throw { code: "resource_missing" };
        return {
          id,
          percent_off: 5,
          duration: "once",
          max_redemptions: 1,
          valid: !used,
          times_redeemed: used ? 1 : 0,
          metadata: { agencyId: "1" },
        };
      });
      t.mock.method(stripe.coupons, "create", async (params) => {
        created++;
        assert.equal(params.percent_off, 5);
        assert.equal(params.duration, "once");
        assert.equal(params.max_redemptions, 1);
        return { ...params, valid: true, times_redeemed: 0 };
      });
      const coupon = await newsletterCheckoutDiscount(1, "price_monthly");
      assert.equal(coupon, "konzocrm_newsletter5_agency_1");
      assert.equal(
        await newsletterCheckoutDiscount(1, "price_monthly"),
        coupon,
      );
      assert.equal(created, 1);
      interval = "year";
      await assert.rejects(newsletterCheckoutDiscount(1, "price_monthly"), {
        status: 409,
      });
      interval = "month";
      used = true;
      await assert.rejects(newsletterCheckoutDiscount(1, "price_monthly"), { status: 409 });
      used = false;
      assert.equal(await newsletterCheckoutDiscount(2, "price_monthly"), null);
      await unsubscribeNewsletter(user, req);
      assert.equal((await newsletterStatus(user)).status, "unsubscribed");
      assert.equal((await newsletterStatus(user)).discountReady, true);
      await newsletterTokenAction(unsubscribe, "unsubscribe", req);
      assert.equal(
        (
          await db.query(
            "SELECT COUNT(*)::int AS n FROM newsletter_subscriptions WHERE status='subscribed'",
          )
        ).rows[0].n,
        0,
      );
      assert.equal(
        (await db.query("SELECT consent_proof FROM newsletter_subscriptions"))
          .rows[0].consent_proof.source,
        "authenticated_newsletter_form",
      );
      await db.query(
        "UPDATE agencies SET subscription_started_at=NOW() WHERE id=1",
      );
      assert.equal(await newsletterCheckoutDiscount(1, "price_monthly"), null);
      assert.equal(await newsletterCheckoutDiscount(3, "price_monthly"), null);
      await db.query(
        "UPDATE newsletter_subscriptions SET requested_at=NULL WHERE user_id=11",
      );
      await assert.rejects(
        subscribeNewsletter(user, req, async () => {
          throw Error("smtp down");
        }),
        { status: 503 },
      );
      assert.equal(
        (
          await db.query(
            "SELECT confirmation_hash FROM newsletter_subscriptions",
          )
        ).rows[0].confirmation_hash,
        null,
      );
    } finally {
      for (const key of keys) {
        if (original[key] === undefined) delete process.env[key];
        else process.env[key] = original[key];
      }
      await db.end();
    }
  },
);
