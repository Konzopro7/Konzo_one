import nodemailer from "nodemailer";

let transporter;

function toBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function createTransporter() {
  if (transporter) {
    return transporter;
  }

  if (process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: toBoolean(process.env.SMTP_SECURE || "false"),
      auth: process.env.SMTP_USER
        ? {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          }
        : undefined
    });
  } else {
    transporter = nodemailer.createTransport({
      jsonTransport: true
    });
  }

  return transporter;
}

export async function sendDocumentByEmail({
  to,
  subject,
  html,
  pdfBuffer,
  filename
}) {
  const tx = createTransporter();
  const info = await tx.sendMail({
    from: process.env.SMTP_FROM || "Konzotech Agency <no-reply@konzotech.agency>",
    to,
    subject,
    html,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: "application/pdf"
      }
    ]
  });

  return {
    messageId: info.messageId,
    mode: process.env.SMTP_HOST ? "smtp" : "json",
    preview: info.message || null
  };
}

export async function sendEmail({ to, subject, html }) {
  const tx = createTransporter();
  const info = await tx.sendMail({
    from: process.env.SMTP_FROM || "Konzotech Agency <no-reply@konzotech.agency>",
    to,
    subject,
    html
  });

  return {
    messageId: info.messageId,
    mode: process.env.SMTP_HOST ? "smtp" : "json",
    preview: info.message || null
  };
}
