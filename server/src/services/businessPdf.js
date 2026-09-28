import PDFDocument from "pdfkit";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { PRODUCT_NAME } from "../../../shared/brand.mjs";
import { ownedImagePath } from "../utils/uploadPaths.js";

const C = { primary: "#0B3C5D", accent: "#2EC4B6", text: "#11243A", muted: "#6C7A89", line: "#DDE4EE", panel: "#F7FAFD" };
const statusLabels = { draft: "Brouillon", sent: "Envoyé", accepted: "Accepté", refused: "Refusé", pending: "En attente de paiement", paid: "Payée" };
const money = value => new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD" }).format(Number(value || 0));
const date = value => {
  if (!value) return "Non précisée";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Non précisée" : parsed.toLocaleDateString("fr-CA", { timeZone: "UTC" });
};

function linesFor(doc, text, width) {
  const result = [];
  for (const paragraph of String(text || "").split(/\r?\n/)) {
    let line = "";
    for (let word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && doc.widthOfString(`${line} ${word}`) > width) { result.push(line); line = ""; }
      while (doc.widthOfString(word) > width) {
        let size = 1;
        while (size < word.length && doc.widthOfString(word.slice(0, size + 1)) <= width) size++;
        result.push(word.slice(0, size)); word = word.slice(size);
      }
      line = line ? `${line} ${word}` : word;
    }
    result.push(line);
  }
  return result.length ? result : [""];
}

export async function buildBusinessPdf({ documentType, data, items = [], client, settings }) {
  const title = documentType === "quote" ? "DEVIS" : documentType === "purchase" ? "BON D’ACHAT" : "FACTURE";
  const company = settings?.agency_name || PRODUCT_NAME;
  const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: { Title: `${title} ${data.number}`, Author: company } });
  const chunks = [];
  doc.on("data", chunk => chunks.push(chunk));
  const result = new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const left = 48;
  const right = doc.page.width - 48;
  const width = right - left;
  const bottom = doc.page.height - 82;
  let y;
  let logo;
  const logoFile = ownedImagePath(settings?.logo_url, { agencyId: settings?.agency_id });
  if (logoFile) {
    try {
      // Supports legacy WebP logos too; no remote URL or cross-agency file reads.
      logo = await sharp(await readFile(logoFile), { limitInputPixels: 25_000_000 }).png().toBuffer();
    } catch { /* Missing or damaged historical logos do not block a document. */ }
  }

  function text(value, x, at, options = {}) {
    doc.text(String(value ?? ""), x, at, { width: options.width || width, ...options });
  }
  function newPage() {
    doc.addPage();
    doc.rect(0, 0, doc.page.width, 5).fill(C.accent);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.primary);
    text(company, left, 29, { width: 300, height: 28, ellipsis: true });
    text(`${title} · ${data.number}`, 355, 29, { width: right - 355, align: "right", height: 28, ellipsis: true });
    y = 78;
  }
  function tableHeader() {
    doc.rect(left, y, width, 28).fill(C.primary);
    doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF");
    text("Description", left + 12, y + 9, { width: 235 });
    text("Qté", 299, y + 9, { width: 34, align: "right" });
    text("Prix unitaire", 340, y + 9, { width: 87, align: "right" });
    text("Montant", 440, y + 9, { width: 95, align: "right" });
    y += 28;
  }

  doc.rect(0, 0, doc.page.width, 134).fill(C.primary);
  doc.rect(0, 130, doc.page.width, 4).fill(C.accent);
  if (logo) {
    doc.roundedRect(left, 32, 70, 70, 9).fill("#FFFFFF");
    doc.image(logo, left + 6, 38, { fit: [58, 58], align: "center", valign: "center" });
  }
  const nameX = logo ? 134 : left;
  doc.font("Helvetica-Bold").fontSize(19).fillColor("#FFFFFF");
  text(company, nameX, 38, { width: 350 - nameX, height: 60, ellipsis: true });
  doc.font("Helvetica-Bold").fontSize(documentType === "purchase" ? 20 : 26);
  text(title, 365, 35, { width: right - 365, align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor("#E7F1FF");
  text(data.number, 365, 72, { width: right - 365, align: "right" });
  text("DOLLARS CANADIENS · CAD", 365, 94, { width: right - 365, align: "right" });

  function infoBlock(label, values, x, at) {
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.muted);
    text(label, x, at, { width: 230 });
    let next = at + 22;
    values.filter(Boolean).forEach((value, index) => {
      doc.font(index === 0 ? "Helvetica-Bold" : "Helvetica").fontSize(index === 0 ? 11 : 10).fillColor(index === 0 ? C.text : C.muted);
      const height = doc.heightOfString(String(value), { width: 230 });
      text(value, x, next, { width: 230 });
      next += height + 5;
    });
    return next;
  }
  const senderEnd = infoBlock("ÉMIS PAR", [company, settings?.agency_email, settings?.agency_phone], left, 161);
  const clientEnd = infoBlock(documentType === "purchase" ? "FOURNISSEUR" : "DESTINATAIRE", [client?.company, client?.name, client?.email, client?.phone], 315, 161);
  y = Math.max(senderEnd, clientEnd) + 20;
  doc.roundedRect(left, y, width, 58, 7).fill(C.panel);
  const metadata = [
    ["Date d’émission", date(data.issueDate)],
    [documentType === "quote" ? "Valable jusqu’au" : "Date d’échéance", date(documentType === "quote" ? data.validUntil : data.dueDate)],
    ["Statut", statusLabels[data.status] || "Non précisé"]
  ];
  metadata.forEach(([label, value], index) => {
    const x = left + 13 + index * 163;
    doc.font("Helvetica").fontSize(9).fillColor(C.muted);
    text(label, x, y + 12, { width: 147 });
    doc.font("Helvetica-Bold").fontSize(9).fillColor(C.text);
    text(value, x, y + 30, { width: 147 });
  });
  y += 80;
  if (y + 60 > bottom) newPage();
  tableHeader();

  items.forEach((item, index) => {
    doc.font("Helvetica").fontSize(10);
    const lines = linesFor(doc, item.description, 231);
    let offset = 0;
    do {
      if (y + 35 > bottom) { newPage(); tableHeader(); }
      const count = Math.min(lines.length - offset, Math.max(1, Math.floor((bottom - y - 20) / 14)));
      const height = Math.max(35, count * 14 + 20);
      if (index % 2 === 0) doc.rect(left, y, width, height).fill(C.panel);
      doc.font("Helvetica").fontSize(10).fillColor(C.text);
      text(lines.slice(offset, offset + count).join("\n"), left + 12, y + 10, { width: 231, lineGap: 2 });
      if (offset === 0) {
        text(new Intl.NumberFormat("fr-CA").format(Number(item.quantity)), 299, y + 10, { width: 34, align: "right" });
        text(money(item.unitPrice), 340, y + 10, { width: 87, align: "right" });
        text(money(item.lineTotal), 440, y + 10, { width: 95, align: "right" });
      }
      doc.moveTo(left, y + height).lineTo(right, y + height).strokeColor(C.line).lineWidth(0.5).stroke();
      y += height;
      offset += count;
    } while (offset < lines.length);
  });
  y += 20;
  if (y + 120 > bottom) newPage();
  doc.font("Helvetica").fontSize(10);
  const termLines = linesFor(doc, settings?.payment_terms, 230);
  const compactTerms = Boolean(settings?.payment_terms) && termLines.length <= 5;
  if (compactTerms) {
    doc.font("Helvetica-Bold").fontSize(10).fillColor(C.text);
    text("Conditions de paiement", left, y + 12, { width: 230 });
    doc.font("Helvetica").fontSize(10).fillColor(C.muted);
    text(termLines.join("\n"), left, y + 35, { width: 230, lineGap: 2 });
  }
  const totalX = 315;
  doc.roundedRect(totalX, y, right - totalX, 110, 8).fill(C.panel);
  const taxLabel = Number.isFinite(data.taxRate) ? `Taxes (${new Intl.NumberFormat("fr-CA", { style: "percent", maximumFractionDigits: 3 }).format(data.taxRate)})` : "Taxes";
  [["Sous-total", data.subtotal], [taxLabel, data.taxAmount]].forEach(([label, value], index) => {
    doc.font("Helvetica").fontSize(10).fillColor(C.text);
    text(label, totalX + 12, y + 15 + index * 23, { width: 104 });
    text(money(value), totalX + 112, y + 15 + index * 23, { width: right - totalX - 124, align: "right" });
  });
  doc.roundedRect(totalX, y + 66, right - totalX, 44, 8).fill(C.primary);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#FFFFFF");
  text("TOTAL CAD", totalX + 12, y + 82, { width: 90 });
  text(money(data.total), totalX + 100, y + 81, { width: right - totalX - 112, align: "right" });
  y += 137;

  function paragraphs(label, value) {
    if (!value) return;
    doc.font("Helvetica").fontSize(10);
    const lines = linesFor(doc, value, width - 24);
    let offset = 0;
    while (offset < lines.length) {
      if (y + 72 > bottom) newPage();
      doc.font("Helvetica-Bold").fontSize(10).fillColor(C.text);
      text(label + (offset ? " (suite)" : ""), left, y);
      y += 21;
      const count = Math.min(lines.length - offset, Math.max(1, Math.floor((bottom - y - 10) / 14)));
      doc.font("Helvetica").fontSize(10).fillColor(C.muted);
      text(lines.slice(offset, offset + count).join("\n"), left, y, { width: width - 24, lineGap: 2 });
      y += count * 14 + 25;
      offset += count;
    }
  }
  if (!compactTerms) paragraphs("Conditions de paiement", settings?.payment_terms);
  paragraphs("Notes", data.notes);

  const pages = doc.bufferedPageRange();
  for (let i = pages.start; i < pages.start + pages.count; i++) {
    doc.switchToPage(i);
    // A footer below the normal text margin must not trigger PDFKit's auto-page.
    doc.page.margins.bottom = 0;
    doc.moveTo(left, doc.page.height - 55).lineTo(right, doc.page.height - 55).strokeColor(C.line).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(C.muted);
    text("Merci pour votre confiance.", left, doc.page.height - 42, { width: 280, lineBreak: false });
    text(`${data.number} · ${i - pages.start + 1} / ${pages.count}`, 350, doc.page.height - 42, { width: right - 350, align: "right", lineBreak: false });
  }
  doc.end();
  return result;
}
