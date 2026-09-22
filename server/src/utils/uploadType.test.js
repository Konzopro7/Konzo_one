import test from "node:test";
import assert from "node:assert/strict";
import { detectUploadType } from "./uploadType.js";

test("upload detection rejects active content and derives the extension from bytes", () => {
  for (const body of ["<html><script>alert(1)</script>", "<svg onload='alert(1)'/>", "", "not an image"]) {
    assert.equal(detectUploadType(Buffer.from(body)), null);
  }
  assert.deepEqual(detectUploadType(Buffer.from([137,80,78,71,13,10,26,10])), { mime: "image/png", extension: ".png" });
  assert.equal(detectUploadType(Buffer.from("%PDF-1.7")).extension, ".pdf");
  assert.equal(detectUploadType(Buffer.from([255,216,255])).extension, ".jpg");
});
