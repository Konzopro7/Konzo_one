import test from "node:test";
import assert from "node:assert/strict";
import { productTourSteps, tourPosition } from "../src/lib/productTour.js";

test("tour points only to actions permitted for the current role", () => {
  for (const role of ["admin", "commercial", "finance", "readonly"]) {
    const steps = productTourSteps(role);
    const targets = steps.map(step => step.target);
    assert.equal(targets.includes("company-logo"), role === "admin");
    assert.equal(targets.includes("client-create"), ["admin", "commercial"].includes(role));
    assert.equal(targets.includes("quote-create"), ["admin", "commercial"].includes(role));
    assert.equal(targets.includes("invoice-create"), role !== "readonly");
    assert.equal(steps.at(-1).target, "guide-link");
    assert.ok(steps.every(step => step.route.startsWith("/") && step.text.length > 30));
  }
});

test("callout remains inside desktop and mobile viewports and clears its target", () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 375, height: 667 }, { width: 320, height: 480 }]) {
    for (const rect of [{ left: 20, right: 180, top: 40, bottom: 80 }, { left: 20, right: 220, top: 220, bottom: 260 }, { left: 20, right: 180, top: viewport.height - 90, bottom: viewport.height - 50 }]) {
      const position = tourPosition(rect, viewport, 340);
      assert.ok(position.left >= 12);
      assert.ok(position.left + position.width <= viewport.width - 12);
      assert.ok(position.top >= 12);
      assert.ok(position.top + Math.min(340, position.maxHeight) <= viewport.height - 12);
      if (position.placement === "below") assert.ok(position.top >= rect.bottom);
      else assert.ok(position.top + Math.min(340, position.maxHeight) <= rect.top);
    }
  }
});
