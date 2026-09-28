import { PRODUCT_NAME } from "../../../shared/brand.mjs";
import nodemailer from "nodemailer";

let transporter;
let transportKey;

function toBoolean(value) {
  return String(value).toLowerCase() === "true";
}

function smtpOptions() {
  if (!process.env.SMTP_HOST) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    (process.env.SMTP_USER && !process.env.SMTP_PASS)
  )
    throw unavailable();
  const secure = toBoolean(
    process.env.SMTP_SECURE || (port === 465 ? "true" : "false"),
  );
  return {
    host: process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    tls: { minVersion: "TLSv1.2" },
    connectionTimeout: 12000,
    greetingTimeout: 12000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
    ...(process.env.SMTP_USER
      ? { auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } }
      : {}),
  };
}

function unavailable() {
  const error = new Error(
    "Le service email est indisponible. Contactez le support.",
  );
  error.status = 503;
  error.code = "EMAIL_NOT_CONFIGURED";
  return error;
}

export function isEmailConfigured() {
  try {
    return Boolean(smtpOptions());
  } catch {
    return false;
  }
}

function sender() {
  return (
    process.env.SMTP_FROM ||
    `${PRODUCT_NAME} <${process.env.SMTP_USER?.includes("@") ? process.env.SMTP_USER : "support@konzocrm.com"}>`
  );
}

function createTransporter() {
  const options = smtpOptions();
  if (!options && process.env.NODE_ENV === "production") throw unavailable();
  const key = JSON.stringify(options);
  if (transporter && transportKey === key) {
    return transporter;
  }

  if (options) {
    transporter = nodemailer.createTransport(options);
  } else {
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
  }

  transportKey = key;

  return transporter;
}

export async function sendDocumentByEmail({
  to,
  subject,
  html,
  pdfBuffer,
  filename,
}) {
  const tx = createTransporter();
  const info = await tx.sendMail({
    from: sender(),
    to,
    subject,
    html,
    attachments: [
      {
        filename,
        content: pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });

  return {
    messageId: info.messageId,
    mode: process.env.SMTP_HOST ? "smtp" : "json",
    preview: info.message || null,
  };
}

export async function sendEmail({ to, subject, html }) {
  const tx = createTransporter();
  const info = await tx.sendMail({
    from: sender(),
    to,
    subject,
    html,
  });

  return {
    messageId: info.messageId,
    mode: process.env.SMTP_HOST ? "smtp" : "json",
    preview: info.message || null,
  };
}
