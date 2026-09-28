import crypto from "node:crypto";
import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import { query, withTransaction } from "../db.js";
import { securityAudit } from "./securityAudit.js";
import { PRODUCT_NAME } from "../../../shared/brand.mjs";

export function mfaKey() {
  const value = String(process.env.MFA_ENCRYPTION_KEY || "");
  const key = Buffer.from(value, "base64");
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("MFA_ENCRYPTION_KEY must be a base64-encoded random 32-byte key.");
  return key;
}
export function encryptMfaSecret(secret, userId) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", mfaKey(), iv);
  cipher.setAAD(Buffer.from(`mfa:${userId}`));
  const encrypted = Buffer.concat([cipher.update(secret,"utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decryptMfaSecret(value, userId) {
  const bytes = Buffer.from(value,"base64");
  const cipher = crypto.createDecipheriv("aes-256-gcm", mfaKey(), bytes.subarray(0,12));
  cipher.setAAD(Buffer.from(`mfa:${userId}`));
  cipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
}
export const hash = value => crypto.createHash("sha256").update(String(value)).digest("hex");
export const recoveryHash = code => hash(String(code).replace(/[\s-]/g, "").toUpperCase());
export const recoveryCodes = () => Array.from({ length: 10 }, () => crypto.randomBytes(12).toString("hex").toUpperCase().match(/.{4}/g).join("-"));

export async function startMfaChallenge(user) {
  await query("DELETE FROM auth_challenges WHERE token_hash IN (SELECT token_hash FROM auth_challenges WHERE expires_at < NOW() LIMIT 1000)");
  const token = crypto.randomBytes(32).toString("hex");
  await query(`INSERT INTO auth_challenges (token_hash,user_id,agency_id,mfa_version,credential_hash) VALUES ($1,$2,$3,$4,$5)`,
    [hash(token),user.id,user.agency_id,user.mfa_version || 0,hash(user.password_hash)]);
  return { mfaRequired: true, enrollmentRequired: !user.mfa_enabled, challengeToken: token };
}

async function lockedChallenge(db, token) {
  if (!/^[a-f0-9]{64}$/.test(String(token))) return null;
  const { rows } = await db.query("SELECT *, expires_at > NOW() AS valid FROM auth_challenges WHERE token_hash=$1 FOR UPDATE", [hash(token)]);
  const challenge = rows[0];
  if (!challenge || !challenge.valid || challenge.consumed || challenge.attempts >= 5) return null;
  const account = await db.query("SELECT * FROM users WHERE id=$1 AND agency_id=$2 FOR UPDATE", [challenge.user_id,challenge.agency_id]);
  const user = account.rows[0];
  if (!user?.is_active || user.mfa_version !== challenge.mfa_version || hash(user.password_hash) !== challenge.credential_hash) return null;
  return { challenge, user };
}

export async function setupMfa(token) {
  return withTransaction(async db => {
    const state = await lockedChallenge(db,token);
    if (!state) return { status: 401, message: "Connexion expirée. Recommencez avec votre mot de passe." };
    if (state.user.mfa_enabled) return { status: 409, message: "La double authentification est déjà configurée." };
    let secret;
    if (state.challenge.pending_secret) secret = decryptMfaSecret(state.challenge.pending_secret,state.user.id);
    else {
      secret = generateSecret();
      await db.query("UPDATE auth_challenges SET pending_secret=$1 WHERE token_hash=$2", [encryptMfaSecret(secret,state.user.id),hash(token)]);
    }
    const uri = generateURI({ issuer: PRODUCT_NAME, label: state.user.email, secret });
    return { secret, qrCode: await QRCode.toDataURL(uri, { width: 220, margin: 2 }) };
  });
}

export async function verifyFactor(user, code) {
  if (/^\d{6}$/.test(code) && user.mfa_secret) {
    const result = await verify({ secret: decryptMfaSecret(user.mfa_secret,user.id), token: code, epochTolerance: 30,
      ...(user.mfa_last_step === null || user.mfa_last_step === undefined ? {} : { afterTimeStep: Number(user.mfa_last_step) }) });
    if (result.valid) return { method: "totp", timeStep: result.timeStep };
  }
  const normalized = String(code).replace(/[\s-]/g, "").toUpperCase();
  if (/^[A-F0-9]{24}$/.test(normalized)) {
    const candidate = Buffer.from(recoveryHash(code),"hex");
    const codes = user.mfa_recovery_hashes || [];
    const found = codes.find(value => value.length === 64 && crypto.timingSafeEqual(Buffer.from(value,"hex"), candidate));
    if (found) return { method: "recovery", hashes: codes.filter(value => value !== found) };
  }
  return null;
}

export async function verifyMfa(token, code, req) {
  return withTransaction(async db => {
    const state = await lockedChallenge(db,token);
    if (!state) return { status: 401, message: "Connexion expirée ou tentatives épuisées. Reconnectez-vous." };
    const { user, challenge } = state;
    req.authActor = { id: user.id, agencyId: user.agency_id };
    if (user.mfa_blocked_until && new Date(user.mfa_blocked_until).getTime() > Date.now()) {
      await securityAudit(req,"MFA_FAIL",user,429,null,db);
      return { status: 429, message: "Trop de tentatives. Patientez dix minutes avant de réessayer." };
    }
    const enrollment = !user.mfa_enabled;
    const checking = enrollment ? { ...user, mfa_secret: challenge.pending_secret, mfa_last_step: null, mfa_recovery_hashes: [] } : user;
    const factor = await verifyFactor(checking,code);
    if (!factor) {
      await db.query("UPDATE auth_challenges SET attempts=attempts+1 WHERE token_hash=$1",[hash(token)]);
      await db.query(`UPDATE users SET mfa_failures=CASE WHEN mfa_blocked_until <= NOW() THEN 1 ELSE mfa_failures+1 END,
        mfa_blocked_until=CASE WHEN mfa_failures >= 4 AND (mfa_blocked_until IS NULL OR mfa_blocked_until > NOW()) THEN NOW()+INTERVAL '10 minutes' ELSE NULL END WHERE id=$1`,[user.id]);
      await securityAudit(req,"MFA_FAIL",user,401,null,db);
      return { status: 401, message: "Code invalide ou déjà utilisé. Utilisez le nouveau code de votre application, ou un code de secours." };
    }
    const codes = enrollment ? recoveryCodes() : null;
    const updated = await db.query(`UPDATE users SET mfa_enabled=true,mfa_secret=$1,mfa_last_step=$2,mfa_recovery_hashes=$3,
      mfa_version=mfa_version+$4,mfa_failures=0,mfa_blocked_until=NULL WHERE id=$5 RETURNING *`,
      [checking.mfa_secret, factor.timeStep ?? user.mfa_last_step, codes ? codes.map(recoveryHash) : factor.hashes || user.mfa_recovery_hashes, enrollment ? 1 : 0, user.id]);
    await db.query("UPDATE auth_challenges SET consumed=true,pending_secret=NULL WHERE token_hash=$1",[hash(token)]);
    if (enrollment) await securityAudit(req,"MFA_ENROLLED",user,200,"totp",db);
    if (factor.method === "recovery") await securityAudit(req,"RECOVERY_USED",user,200,"recovery",db);
    await securityAudit(req,"AUTH_OK",user,200,factor.method,db);
    return { user: updated.rows[0], recoveryCodes: codes };
  });
}
