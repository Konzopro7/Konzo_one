import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import pool from "../db.js";
import quotes from "./quotes.js";
import invoices from "./invoices.js";
import payments from "./payments.js";
import { getStripeClient } from "../services/stripeClient.js";
import { readFile } from "node:fs/promises";

for (const [name, router] of [
  ["quotes", quotes],
  ["invoices", invoices],
]) {
  for (const [label, invalid] of [
    [
      "impossible calendar day",
      { validUntil: "2026-02-30", dueDate: "2026-02-30" },
    ],
    ["empty services", { items: [] }],
    ["tax precision beyond storage", { taxRate: 0.149751 }],
    [
      "price precision beyond storage",
      { items: [{ description: "Service", unitPrice: 0.335, quantity: 1 }] },
    ],
    [
      "quantity precision beyond storage",
      { items: [{ description: "Service", unitPrice: 1, quantity: 0.001 }] },
    ],
    [
      "blank description",
      { items: [{ description: "   ", unitPrice: 1, quantity: 1 }] },
    ],
    [
      "infinite price",
      { items: [{ description: "Service", unitPrice: Infinity, quantity: 1 }] },
    ],
    [
      "amount above database precision",
      {
        items: [
          { description: "Service", unitPrice: 9999999999, quantity: 100 },
        ],
      },
    ],
  ])
    test(`${name}: ${label} is rejected before database access`, async (t) => {
      t.mock.method(pool, "query", async () => {
        throw Error("Must not query database");
      });
      const route = router.stack.find(
        (layer) => layer.route?.path === "/" && layer.route.methods.post,
      ).route;
      const res = {
        statusCode: 200,
        status(n) {
          this.statusCode = n;
          return this;
        },
        json(data) {
          this.body = data;
        },
      };
      await route.stack.at(-1).handle(
        {
          user: { id: 1, agencyId: 10 },
          body: {
            clientId: 1,
            ...invalid,
            items: invalid.items || [
              { description: "Service", unitPrice: 1, quantity: 1 },
            ],
          },
        },
        res,
        (error) => {
          throw error;
        },
      );
      assert.equal(res.statusCode, 400);
      assert.ok(res.body.issues);
    });
}

test("PostgreSQL DATE parser preserves civil days without changing timestamps", () => {
  assert.equal(pg.types.getTypeParser(1082)("2026-09-28"), "2026-09-28");
  assert.ok(
    pg.types.getTypeParser(1184)("2026-09-28 12:00:00+00") instanceof Date,
  );
});

test(
  "PostgreSQL: widened document tax rate preserves old totals and 14.975 percent",
  { skip: !process.env.TEST_DATABASE_URL },
  async () => {
    const db = new pg.Client({
      connectionString: process.env.TEST_DATABASE_URL,
    });
    await db.connect();
    try {
      await db.query(`CREATE TEMP TABLE quotes(id INT, tax_rate NUMERIC(6,4), total NUMERIC(12,2));
      CREATE TEMP TABLE invoices(id INT, tax_rate NUMERIC(6,4), total NUMERIC(12,2));
      INSERT INTO quotes VALUES(1,0.2,120.00); INSERT INTO invoices VALUES(1,0.1498,114.98);`);
      await db.query(
        await readFile(
          new URL(
            "../../sql/migrations/2026-09-28-document-tax-precision.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      assert.deepEqual(
        (await db.query("SELECT tax_rate, total FROM quotes")).rows[0],
        { tax_rate: "0.20000", total: "120.00" },
      );
      assert.deepEqual(
        (await db.query("SELECT tax_rate, total FROM invoices")).rows[0],
        { tax_rate: "0.14980", total: "114.98" },
      );
      for (const table of ["quotes", "invoices"]) {
        await db.query(`INSERT INTO ${table} VALUES (2,$1,114.98)`, [0.14975]);
        assert.equal(
          (await db.query(`SELECT tax_rate FROM ${table} WHERE id=2`)).rows[0]
            .tax_rate,
          "0.14975",
        );
      }
    } finally {
      await db.end();
    }
  },
);

test("Public invoice checkout returns to its document instead of the private CRM", async (t) => {
  const keys = [
    "STRIPE_SECRET_KEY",
    "STRIPE_MODE",
    "PUBLIC_CLIENT_URL",
    "STRIPE_SUCCESS_URL",
    "STRIPE_CANCEL_URL",
  ];
  const previous = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, {
    STRIPE_SECRET_KEY: "sk_test_return_fixture",
    STRIPE_MODE: "test",
    PUBLIC_CLIENT_URL: "https://example.invalid",
    STRIPE_SUCCESS_URL: "https://example.invalid/invoices",
    STRIPE_CANCEL_URL: "https://example.invalid/invoices",
  });
  t.after(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  });
  t.mock.method(pool, "query", async (sql) => ({
    rows: sql.includes("FROM invoices")
      ? [
          {
            id: 1,
            agency_id: 10,
            status: "pending",
            total: 50,
            invoice_number: "FAC-TEST",
            payment_link_token: "fixture",
          },
        ]
      : [],
  }));
  let checkout;
  t.mock.method(
    getStripeClient().checkout.sessions,
    "create",
    async (params) => {
      checkout = params;
      return { id: "cs_fixture", url: "https://checkout.stripe.com/fixture" };
    },
  );
  const route = payments.stack.find(
    (layer) => layer.route?.path === "/public/:token/checkout-session",
  ).route;
  const res = {
    json(data) {
      this.body = data;
    },
  };
  await route.stack
    .at(-1)
    .handle({ params: { token: "fixture" } }, res, (error) => {
      throw error;
    });
  assert.equal(
    checkout.success_url,
    "https://example.invalid/portal/invoices/fixture?payment=success",
  );
  assert.equal(
    checkout.cancel_url,
    "https://example.invalid/portal/invoices/fixture?payment=cancelled",
  );
  assert.equal(checkout.metadata.agencyId, "10");
});
