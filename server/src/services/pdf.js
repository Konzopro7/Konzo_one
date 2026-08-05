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

function resolveDocumentTitle(documentType) {
  if (documentType === "quote") {
    return "DEVIS";
  }
  if (documentType === "purchase") {
    return "BON D ACHAT";
  }
  return "FACTURE";
}

export async function buildBusinessPdf({
  documentType,
  data,
  items,
  client,
  settings
}) {
  const doc = new PDFDocument({
    size: "A4",
    margin: 50
  });

  const chunks = [];
  doc.on("data", (chunk) => chunks.push(chunk));

  const bufferPromise = new Promise((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const documentTitle = resolveDocumentTitle(documentType);
  const partnerLabel = documentType === "purchase" ? "Fournisseur" : "Client";
  const leftLabel = documentType === "quote" ? "Validite" : "Date limite";
  const leftValue = documentType === "quote"
    ? formatDate(data.validUntil)
    : formatDate(data.dueDate);

  doc.rect(0, 0, doc.page.width, 118).fill(COLORS.primary);
  doc.rect(0, 108, doc.page.width, 10).fill(COLORS.accent);

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(20)
    .text(settings?.agency_name || "KONZOTECH AGENCY", 50, 36, {
      align: "left"
    });

  doc
    .fillColor("#CDE2FF")
    .font("Helvetica")
    .fontSize(10)
    .text("Solutions digitales et developpement web", 50, 66);

  doc
    .fillColor("#FFFFFF")
    .font("Helvetica-Bold")
    .fontSize(24)
    .text(documentTitle, 0, 36, {
      align: "right"
    });

  doc
    .fillColor("#E7F1FF")
    .font("Helvetica")
    .fontSize(10)
    .text(data.number, 0, 68, { align: "right" });

  let y = 150;

  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Informations agence", 50, y);
  y += 18;
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(10)
    .text(settings?.agency_email || "contact@konzotech.agency", 50, y);
  y += 14;
  doc.text(settings?.agency_phone || "+1 000 000 0000", 50, y);

  let rightY = 150;
  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text(partnerLabel, 330, rightY);
  rightY += 18;
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(10)
    .text(client?.company || "-", 330, rightY);
  rightY += 14;
  doc.text(client?.name || "-", 330, rightY);
  rightY += 14;
  doc.text(client?.email || "-", 330, rightY);
  rightY += 14;
  doc.text(client?.phone || "-", 330, rightY);

  y = 238;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(COLORS.line).stroke();
  y += 20;

  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Numero", 50, y)
    .text("Date d'emission", 210, y)
    .text(leftLabel, 380, y);
  y += 14;
  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(10)
    .text(data.number, 50, y)
    .text(formatDate(data.issueDate), 210, y)
    .text(leftValue, 380, y);

  y += 32;
  doc.rect(50, y, 495, 24).fill(COLORS.panel);
  doc
    .fillColor(COLORS.text)
    .font("Helvetica-Bold")
    .fontSize(10)
    .text("Description", 60, y + 7)
    .text("Qte", 315, y + 7)
    .text("Prix unitaire", 370, y + 7)
    .text("Total", 485, y + 7);

  y += 32;

  for (const item of items) {
    y = ensurePageSpace(doc, y, 22);
    doc
      .fillColor(COLORS.text)
      .font("Helvetica")
      .fontSize(10)
      .text(item.description, 60, y, { width: 240 });
    doc.text(String(item.quantity), 320, y);
    doc.text(formatMoney(item.unitPrice, settings?.currency || "CAD"), 370, y, {
      width: 95,
      align: "right"
    });
    doc.text(formatMoney(item.lineTotal, settings?.currency || "CAD"), 485, y, {
      width: 50,
      align: "right"
    });
    y += 20;
    doc
      .moveTo(50, y)
      .lineTo(545, y)
      .strokeColor(COLORS.line)
      .lineWidth(0.6)
      .stroke();
    y += 8;
  }

  y += 8;
  y = ensurePageSpace(doc, y, 110);

  doc
    .font("Helvetica")
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text(settings?.payment_terms || "Paiement sous 15 jours.", 50, y, {
      width: 300
    });

  const totalsX = 360;
  doc
    .fillColor(COLORS.text)
    .font("Helvetica")
    .fontSize(10)
    .text("Sous-total", totalsX, y)
    .text("TVA", totalsX, y + 18)
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("TOTAL", totalsX, y + 44);

  doc
    .fillColor(COLORS.text)
    .font("Helvetica")
    .fontSize(10)
    .text(formatMoney(data.subtotal, settings?.currency || "CAD"), totalsX + 90, y, {
      width: 95,
      align: "right"
    })
    .text(formatMoney(data.taxAmount, settings?.currency || "CAD"), totalsX + 90, y + 18, {
      width: 95,
      align: "right"
    })
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor(COLORS.primary)
    .text(formatMoney(data.total, settings?.currency || "CAD"), totalsX + 90, y + 44, {
      width: 95,
      align: "right"
    });

  doc
    .fillColor(COLORS.muted)
    .font("Helvetica")
    .fontSize(9)
    .text(
      `Merci pour votre confiance - ${settings?.agency_name || "Konzotech Agency"}`,
      50,
      doc.page.height - 55,
      { align: "left" }
    );

  doc.end();
  return bufferPromise;
}

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
    .text(settings?.agency_name || "Konzotech Agency", 50, 72);

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
