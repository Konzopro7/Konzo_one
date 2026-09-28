import test from "node:test";
import assert from "node:assert/strict";
import router from "./newsletter.js";
test("Newsletter requires explicit consent and rejects client-supplied recipients or tenant IDs", async () => {
  const handler = router.stack
    .find((layer) => layer.route?.path === "/subscribe")
    .route.stack.at(-1).handle;
  for (const body of [
    {},
    { consent: false },
    { consent: true, email: "other@example.test" },
    { consent: true, agencyId: 99 },
  ]) {
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };
    await handler({ body, user: { id: 1, agencyId: 1 } }, res, (error) => {
      throw error;
    });
    assert.equal(res.statusCode, 400);
  }
});
