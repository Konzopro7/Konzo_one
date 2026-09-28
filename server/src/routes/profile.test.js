import test from "node:test";
import assert from "node:assert/strict";
import pool from "../db.js";
import auth from "./auth.js";
import uploads from "./uploads.js";
import sharp from "sharp";
import { unlink, readFile } from "node:fs/promises";
import { ownedImagePath } from "../utils/uploadPaths.js";

const handler = (router, path, method) => router.stack.find(layer => layer.route?.path === path && layer.route.methods[method]).route.stack.at(-1).handle;
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test("all user roles can update their own display name without changing identity or permissions", async t => {
  const calls = [];
  t.mock.method(pool, "query", async (sql, params) => { calls.push({ sql, params }); return { rows: [{ full_name: params[0], avatar_url: null }] }; });
  for (const role of ["admin", "commercial", "finance", "readonly"]) {
    const res = response();
    await handler(auth, "/profile", "put")({ user: { id: 5, agencyId: 10, role }, body: { fullName: "  Camille Martin  ", avatarUrl: null, id: 999, role: "admin", email: "other@example.invalid" } }, res, error => { throw error; });
    assert.deepEqual(res.body, { fullName: "Camille Martin", avatarUrl: null });
  }
  assert.ok(calls.every(call => call.sql.includes("WHERE id = $3 AND agency_id = $4")));
  assert.deepEqual(calls[0].params, ["Camille Martin", null, 5, 10]);
});

test("profile rejects foreign avatars and invalid names before any database write", async t => {
  t.mock.method(pool, "query", () => { throw Error("Unexpected database write"); });
  const origin = new URL(process.env.API_URL || "http://localhost:4000").origin;
  for (const body of [
    { fullName: "X", avatarUrl: null },
    { fullName: "Camille", avatarUrl: `${origin}/uploads/20/avatar/5/1790550000000-0123456789abcdef.png` },
    { fullName: "Camille", avatarUrl: `${origin}/uploads/10/avatar/6/1790550000000-0123456789abcdef.png` },
    { fullName: "Camille", avatarUrl: "https://example.invalid/photo.png" }
  ]) {
    const res = response();
    await handler(auth, "/profile", "put")({ user: { id: 5, agencyId: 10 }, body }, res, error => { throw error; });
    assert.equal(res.statusCode, 400);
  }
});

test("avatar uploads reject PDFs and corrupt images; company logo remains administrator-only", async () => {
  for (const [role, purpose, mimeType, bytes, expected] of [
    ["readonly", "avatar", "application/pdf", Buffer.from("%PDF-1.7"), 400],
    ["readonly", "avatar", "image/png", Buffer.from([137,80,78,71,13,10,26,10]), 400],
    ["commercial", "logo", "image/png", Buffer.from([137,80,78,71,13,10,26,10]), 403],
    ["readonly", "document", "application/pdf", Buffer.from("%PDF-1.7"), 403]
  ]) {
    const res = response();
    await handler(uploads, "/", "post")({ user: { id: 5, agencyId: 10, role }, body: { purpose, mimeType, fileName: "test", dataBase64: bytes.toString("base64") } }, res, error => { throw error; });
    assert.equal(res.statusCode, expected);
  }
});

test("a read-only user can import, save and remove their own normalized profile image", async t => {
  const user = { id: 2147483646, agencyId: 2147483646, role: "readonly" };
  const image = await sharp({ create: { width: 1200, height: 600, channels: 4, background: "#2EC4B6" } }).webp().toBuffer();
  const res = response();
  await handler(uploads, "/", "post")({ user, body: { purpose: "avatar", mimeType: "image/webp", fileName: "photo.webp", dataBase64: image.toString("base64") } }, res, error => { throw error; });
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.mimeType, "image/png");
  const file = ownedImagePath(res.body.url, { agencyId: user.agencyId, purpose: "avatar", userId: user.id });
  assert.ok(file);
  try {
    const metadata = await sharp(await readFile(file)).metadata();
    assert.equal(metadata.width, 800);
    assert.equal(metadata.format, "png");
    t.mock.method(pool, "query", async (sql, params) => ({ rows: [{ full_name: params[0], avatar_url: params[1] }] }));
    const saved = response();
    await handler(auth, "/profile", "put")({ user, body: { fullName: "Camille", avatarUrl: res.body.url } }, saved, error => { throw error; });
    assert.equal(saved.body.avatarUrl, res.body.url);
    const removed = response();
    await handler(auth, "/profile", "put")({ user, body: { fullName: "Camille", avatarUrl: null } }, removed, error => { throw error; });
    assert.equal(removed.body.avatarUrl, null);
  } finally { await unlink(file); }
});
