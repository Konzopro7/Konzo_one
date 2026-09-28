import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { withTransaction } from "../db.js";
import { hash } from "./mfa.js";
import { securityAudit } from "./securityAudit.js";
import { sendEmail } from "./mailer.js";
import { PRODUCT_NAME } from "../../../shared/brand.mjs";

export function resetLink(token) {
  const configured = process.env.PUBLIC_CLIENT_URL || process.env.CLIENT_URL?.split(",")[0]?.trim() || "http://localhost:5173";
  const url = new URL(configured);
  if (url.username || url.password || !["http:", "https:"].includes(url.protocol) || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw new Error("PUBLIC_CLIENT_URL must be a trusted frontend URL (HTTPS in production).");
  }
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/reset-password`;
  url.search = "";
  // The fragment is never sent to Apache or included in the referrer.
  url.hash = `token=${token}`;
  return url.toString();
}

export async function issuePasswordReset(email, req, { operator = false } = {}) {
  return withTransaction(async db => {
    await db.query("DELETE FROM password_reset_tokens WHERE token_hash IN (SELECT token_hash FROM password_reset_tokens WHERE expires_at < NOW() AND created_at < NOW()-INTERVAL '1 hour' LIMIT 1000)");
    const { rows } = await db.query("SELECT * FROM users WHERE email=$1 FOR UPDATE", [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user?.is_active) return null;
    if (!operator) {
      const recent = await db.query(`SELECT COUNT(*)::INT AS total, MAX(created_at) > NOW()-INTERVAL '90 seconds' AS too_recent
        FROM password_reset_tokens WHERE user_id=$1 AND created_at > NOW()-INTERVAL '1 hour'`, [user.id]);
      if (recent.rows[0].too_recent || recent.rows[0].total >= 5) return null;
    }
    const token = crypto.randomBytes(32).toString("hex");
    const url = resetLink(token);
    await db.query("INSERT INTO password_reset_tokens(token_hash,user_id,agency_id,credential_hash) VALUES ($1,$2,$3,$4)", [hash(token),user.id,user.agency_id,hash(user.password_hash)]);
    await securityAudit(req,"RESET_REQUESTED",user,202,operator ? "operator" : "email",db);
    return { token, url, user };
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[character]));
}

export async function requestPasswordReset(email, req, deliver = sendEmail) {
  const reset = await issuePasswordReset(email,req);
  if (!reset) return;
  try {
    await deliver({ to: reset.user.email, subject: `${PRODUCT_NAME} — Réinitialisation de votre mot de passe`,
      html: `<div style="font-family:Arial,sans-serif;color:#0b3c5d;max-width:560px"><h2>${PRODUCT_NAME}</h2><p>Vous avez demandé un nouveau mot de passe.</p><p><a href="${escapeHtml(reset.url)}" style="display:inline-block;padding:12px 20px;background:#0b3c5d;color:white;border-radius:8px;text-decoration:none">Choisir mon nouveau mot de passe</a></p><p>Ce lien expire dans vingt minutes et ne fonctionne qu’une fois. La double authentification reste obligatoire.</p><p>Si vous n’avez pas fait cette demande, ignorez cet email : votre mot de passe reste inchangé.</p></div>` });
    await securityAudit(req,"RESET_EMAIL_SENT",reset.user,200,"email");
  } catch {
    await withTransaction(db => db.query("UPDATE password_reset_tokens SET consumed=true WHERE token_hash=$1",[hash(reset.token)]));
    await securityAudit(req,"RESET_EMAIL_FAIL",reset.user,503,"email");
    throw new Error("Password reset email delivery failed.");
  }
}

export async function resetPassword(token, password, req) {
  if (!/^[a-f0-9]{64}$/.test(String(token))) return null;
  const newHash = await bcrypt.hash(password,12);
  return withTransaction(async db => {
    // Lock the user before the token, in the same order used by issuance.
    const lookup = await db.query("SELECT user_id FROM password_reset_tokens WHERE token_hash=$1",[hash(token)]);
    if (!lookup.rows[0]) return null;
    const account = await db.query("SELECT * FROM users WHERE id=$1 FOR UPDATE",[lookup.rows[0].user_id]);
    const user = account.rows[0];
    const result = await db.query("SELECT *, expires_at > NOW() AS valid FROM password_reset_tokens WHERE token_hash=$1 FOR UPDATE",[hash(token)]);
    const reset = result.rows[0];
    if (!user?.is_active || !reset?.valid || reset.consumed || reset.agency_id !== user.agency_id || reset.credential_hash !== hash(user.password_hash)) return null;
    await db.query("UPDATE users SET password_hash=$1,mfa_version=mfa_version+1 WHERE id=$2",[newHash,user.id]);
    await db.query("UPDATE password_reset_tokens SET consumed=true WHERE user_id=$1",[user.id]);
    // Version and credential checks revoke existing sessions and password challenges.
    req.authActor = { id:user.id,agencyId:user.agency_id };
    await securityAudit(req,"PASSWORD_RESET",user,200,null,db);
    return { email: user.email };
  });
}
