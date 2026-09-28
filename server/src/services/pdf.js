import { PRODUCT_NAME } from "../../../shared/brand.mjs";
import PDFDocument from "pdfkit";

const COLORS = {
  primary: "#0B3C5D",
  accent: "#2EC4B6",
  text: "#11243A",
  muted: "#6C7A89",
  line: "#DDE4EE",
  panel: "#F7FAFD"
};

function formatMoney(value, currency = "CAD") {
  const activeCurrency = "CAD";
  return new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: activeCurrency
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  return date.toLocaleDateString("fr-FR");
}

function ensurePageSpace(doc, y, neededHeight) {
  if (y + neededHeight <= doc.page.height - 60) {
    return y;
  }
  doc.addPage();
  return 60;
}

export { buildBusinessPdf } from "./businessPdf.js";

export async function buildAccountingExportPdf({ month, entries, settings }) {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const bufferPromise = new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  doc
    .fillColor(COLORS.primary)
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(`Export comptable ${month}`, 50, 45);

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(10)
    .text(settings?.agency_name || PRODUCT_NAME, 50, 72);

  let y = 112;
  doc.rect(50, y, 495, 24).fill(COLORS.panel);
  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(9)
    .text("Date", 58, y + 8)
    .text("Type", 118, y + 8)
    .text("Reference", 190, y + 8)
    .text("Contrepartie", 290, y + 8)
    .text("Montant", 470, y + 8, { width: 60, align: "right" });

  y += 34;
  let creditTotal = 0;
  let debitTotal = 0;

  for (const entry of entries) {
    y = ensurePageSpace(doc, y, 24);
    if (entry.direction === "credit") creditTotal += Number(entry.amount || 0);
    if (entry.direction === "debit") debitTotal += Number(entry.amount || 0);

    doc
      .fillColor(COLORS.text)
      .font("Helvetica")
      .fontSize(9)
      .text(formatDate(entry.entryDate), 58, y)
      .text(entry.entryType, 118, y)
      .text(entry.referenceNumber || "-", 190, y)
      .text(entry.counterpartName || "-", 290, y, { width: 160 })
      .text(formatMoney(entry.amount, settings?.currency || "CAD"), 470, y, {
        width: 60,
        align: "right"
      });
    y += 20;
  }

  y = ensurePageSpace(doc, y + 10, 80);
  doc.moveTo(50, y).lineTo(545, y).strokeColor(COLORS.line).stroke();
  y += 16;
  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(11)
    .text("Credits", 350, y)
    .text(formatMoney(creditTotal, settings?.currency || "CAD"), 450, y, {
      width: 85,
      align: "right"
    })
    .text("Debits", 350, y + 18)
    .text(formatMoney(debitTotal, settings?.currency || "CAD"), 450, y + 18, {
      width: 85,
      align: "right"
    })
    .fillColor(COLORS.primary)
    .text("Net", 350, y + 42)
    .text(formatMoney(creditTotal - debitTotal, settings?.currency || "CAD"), 450, y + 42, {
      width: 85,
      align: "right"
    });

  doc.end();
  return bufferPromise;
}
