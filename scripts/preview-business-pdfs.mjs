// Fictitious examples only. No database access, document emails or CRM writes.
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { buildBusinessPdf } from "../server/src/services/pdf.js";
import { uploadRoot } from "../server/src/utils/uploadPaths.js";
import path from "node:path";

const sharp = createRequire(new URL("../server/package.json", import.meta.url))("sharp");

const output = fileURLToPath(new URL("../output/pdf/", import.meta.url));
await mkdir(output, { recursive: true });
const agencyId = 2147483647;
const folder = path.join(uploadRoot, String(agencyId), "logo");
await mkdir(folder, { recursive: true });
const name = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}.png`;
const logo = path.join(folder, name);
try {
  await writeFile(logo, await sharp(await readFile(new URL("../client/public/logo.svg", import.meta.url))).png().toBuffer());
  const settings = { agency_id: agencyId, agency_name: "Studio Nord", agency_email: "bonjour@studio-nord.example", agency_phone: "+1 (514) 555-0100", payment_terms: "Paiement sous 15 jours. Merci d’indiquer le numéro de facture lors de votre règlement.", logo_url: `${process.env.API_URL || "http://localhost:4000"}/uploads/${agencyId}/logo/${name}` };
  const client = { company: "Atelier Boréal", name: "Camille Martin", email: "camille@atelier-boreal.example", phone: "+1 (418) 555-0120" };
  const items = [{ description: "Maintenance du site web\nMises à jour, sauvegarde et vérification mensuelle.", quantity: 1, unitPrice: 45, lineTotal: 45 }, { description: "Conception du site web\nPages de présentation et adaptation mobile.", quantity: 1, unitPrice: 1200, lineTotal: 1200 }, { description: "Analyse du secteur et recommandations", quantity: 1, unitPrice: 200, lineTotal: 200 }];
  for (const documentType of ["invoice", "quote"]) {
    const data = { number: documentType === "invoice" ? "FAC-EXEMPLE-0001" : "DEV-EXEMPLE-0001", issueDate: "2026-09-27", dueDate: "2026-10-12", validUntil: "2026-10-27", status: documentType === "invoice" ? "pending" : "draft", subtotal: 1445, taxRate: 0, taxAmount: 0, total: 1445, notes: documentType === "quote" ? "Exemple de présentation avec données fictives. Le périmètre et le calendrier seront confirmés avec le client." : "" };
    await writeFile(path.join(output, `${documentType === "invoice" ? "facture" : "devis"}-exemple.pdf`), await buildBusinessPdf({ documentType, data, items, client, settings }));
  }
  console.log("Generated fictitious invoice and quote in output/pdf/");
} finally {
  await unlink(logo);
}
