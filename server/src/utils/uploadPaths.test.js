import test from "node:test";
import assert from "node:assert/strict";
import { ownedImagePath } from "./uploadPaths.js";

test("image paths only resolve the owner's generated uploads on the configured API", () => {
  const origin = new URL(process.env.API_URL || "http://localhost:4000").origin;
  const name = "1790550000000-0123456789abcdef.png";
  assert.ok(ownedImagePath(`${origin}/uploads/10/logo/${name}`, { agencyId: 10 }));
  const own = `${origin}/uploads/10/avatar/5/${name}`;
  assert.ok(ownedImagePath(own, { agencyId: 10, purpose: "avatar", userId: 5 }));
  assert.equal(ownedImagePath(own, { agencyId: 10, purpose: "avatar", userId: 6 }), null);
  assert.equal(ownedImagePath(own, { agencyId: 20, purpose: "avatar", userId: 5 }), null);
  assert.equal(ownedImagePath(`https://example.invalid/uploads/10/logo/${name}`, { agencyId: 10 }), null);
  assert.equal(ownedImagePath(`${origin}/uploads/10/logo/../../secret.png`, { agencyId: 10 }), null);
  assert.equal(ownedImagePath(`${origin}/uploads/10/logo/${name}?redirect=1`, { agencyId: 10 }), null);
  assert.equal(ownedImagePath(`${origin}/uploads/10/logo/anything.svg`, { agencyId: 10 }), null);
});
