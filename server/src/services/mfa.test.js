import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { generateSecret, generate } from "otplib";
import { encryptMfaSecret, decryptMfaSecret, verifyFactor, recoveryCodes, recoveryHash, mfaKey } from "./mfa.js";

function key(t) {
  const previous = process.env.MFA_ENCRYPTION_KEY;
  process.env.MFA_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
  t.after(() => { if (previous === undefined) delete process.env.MFA_ENCRYPTION_KEY; else process.env.MFA_ENCRYPTION_KEY = previous; });
}
test("MFA encryption is randomized, authenticated and bound to the account", t => {
  key(t);
  const a = encryptMfaSecret("SEED", 1), b = encryptMfaSecret("SEED", 1);
  assert.notEqual(a,b);
  assert.equal(decryptMfaSecret(a,1),"SEED");
  assert.throws(() => decryptMfaSecret(a,2));
  const bytes = Buffer.from(a,"base64"); bytes[bytes.length-1] ^= 1;
  assert.throws(() => decryptMfaSecret(bytes.toString("base64"),1));
  process.env.MFA_ENCRYPTION_KEY = "invalid";
  assert.throws(mfaKey);
});
test("TOTP rejects previously used time steps, malformed and expired codes", async t => {
  key(t);
  const secret = generateSecret();
  const user = { id: 1, mfa_secret: encryptMfaSecret(secret,1), mfa_last_step: null };
  const code = await generate({ secret });
  const factor = await verifyFactor(user,code);
  assert.equal(factor.method,"totp");
  assert.equal(await verifyFactor({ ...user,mfa_last_step: factor.timeStep },code),null);
  assert.equal(await verifyFactor(user,"abc123"),null);
  const old = await generate({ secret, epoch: Math.floor(Date.now()/1000)-300 });
  assert.equal(await verifyFactor(user,old),null);
});
test("recovery codes are random and verified against hashes only", async t => {
  key(t);
  const codes = recoveryCodes();
  assert.equal(new Set(codes).size,10);
  const user = { mfa_recovery_hashes: codes.map(recoveryHash) };
  const result = await verifyFactor(user,codes[0].toLowerCase());
  assert.equal(result.method,"recovery");
  assert.equal(result.hashes.length,9);
  assert.equal(await verifyFactor({ ...user,mfa_recovery_hashes: result.hashes },codes[0]),null);
});
