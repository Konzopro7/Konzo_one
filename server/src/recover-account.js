// Local operator tool only. No public endpoint exposes recovery links.
import dotenv from "dotenv";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import pool from "./db.js";
import { issuePasswordReset } from "./services/passwordReset.js";

dotenv.config();
try {
  const value = flag => process.argv[process.argv.indexOf(flag)+1];
  const email = process.argv.includes("--email") ? value("--email") : null;
  const file = process.argv.includes("--file") ? value("--file") : null;
  if (!email || !file || !path.isAbsolute(file)) throw new Error("Use --email ACCOUNT --file ABSOLUTE_PRIVATE_HTML_PATH.");
  if (process.env.NODE_ENV === "production" || !["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname)) throw new Error("This recovery tool is restricted to local development databases.");
  const reset = await issuePasswordReset(email,{ path:"/operator-recovery",headers:{} },{ operator:true });
  if (!reset) throw new Error("Active account not found.");
  if (!["localhost","127.0.0.1"].includes(new URL(reset.url).hostname)) throw new Error("Configure a localhost PUBLIC_CLIENT_URL for local recovery.");
  await mkdir(path.dirname(file),{ recursive:true });
  await writeFile(file,`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Récupération privée — konzoCRM.com</title></head><body style="font-family:Arial,sans-serif;color:#0b3c5d;max-width:560px;margin:60px auto;padding:24px"><h1>Retrouvez votre accès</h1><p>Ce lien privé vous permet de choisir un nouveau mot de passe. Il expire dans vingt minutes et ne fonctionne qu’une fois.</p><p><a href="${reset.url}" rel="noreferrer" style="display:inline-block;padding:14px 20px;background:#0b3c5d;color:white;border-radius:8px;text-decoration:none">Choisir mon nouveau mot de passe</a></p><p>Ne partagez pas ce fichier. La double authentification sera demandée lors de votre prochaine connexion.</p></body></html>`,{ flag:"wx",mode:0o600 });
  console.log(JSON.stringify({ privateFile:file,expiresInMinutes:20 }));
} catch (error) {
  console.error(error.message);
  process.exitCode=1;
} finally { await pool.end(); }
