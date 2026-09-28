import test from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import { sendEmail, sendDocumentByEmail, isEmailConfigured } from "./mailer.js";

function environment(t, values) {
  const previous = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );
  for (const [key, value] of Object.entries(values)) {
    if (value === null) delete process.env[key];
    else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("Production email refuses missing SMTP instead of pretending to deliver a document", async (t) => {
  environment(t, {
    NODE_ENV: "production",
    SMTP_HOST: null,
    SMTP_USER: null,
    SMTP_PASS: null,
  });
  t.mock.method(nodemailer, "createTransport", () => {
    throw Error("No simulated transporter allowed");
  });
  assert.equal(isEmailConfigured(), false);
  await assert.rejects(
    sendEmail({
      to: "fixture@example.invalid",
      subject: "Fixture",
      html: "Test",
    }),
    { code: "EMAIL_NOT_CONFIGURED", status: 503 },
  );
  await assert.rejects(
    sendDocumentByEmail({
      to: "fixture@example.invalid",
      subject: "Fixture",
      html: "Test",
      pdfBuffer: Buffer.from("fixture"),
      filename: "fixture.pdf",
    }),
    { code: "EMAIL_NOT_CONFIGURED" },
  );
});

test("Incomplete SMTP credentials and invalid ports fail closed", async (t) => {
  environment(t, {
    NODE_ENV: "production",
    SMTP_HOST: "smtp.example.invalid",
    SMTP_PORT: "465",
    SMTP_USER: "support@example.invalid",
    SMTP_PASS: null,
  });
  assert.equal(isEmailConfigured(), false);
  process.env.SMTP_PASS = "fixture-password";
  process.env.SMTP_PORT = "invalid";
  assert.equal(isEmailConfigured(), false);
});

test("Configured SMTP uses authenticated TLS, bounded timeouts and the real sending identity", async (t) => {
  environment(t, {
    NODE_ENV: "production",
    SMTP_HOST: "smtp.example.invalid",
    SMTP_PORT: "465",
    SMTP_SECURE: null,
    SMTP_USER: "support@example.invalid",
    SMTP_PASS: "fixture-password",
    SMTP_FROM: null,
  });
  let options, message;
  t.mock.method(nodemailer, "createTransport", (value) => {
    options = value;
    return {
      sendMail: async (value) => {
        message = value;
        return {
          messageId: "fixture",
          accepted: ["recipient@example.invalid"],
        };
      },
    };
  });
  const result = await sendEmail({
    to: "recipient@example.invalid",
    subject: "Fixture",
    html: "Test",
  });
  assert.equal(result.mode, "smtp");
  assert.equal(options.secure, true);
  assert.equal(options.tls.minVersion, "TLSv1.2");
  assert.equal(options.auth.user, "support@example.invalid");
  assert.equal(options.connectionTimeout, 12000);
  assert.equal(message.from, "konzoCRM.com <support@example.invalid>");
  process.env.SMTP_PORT = "587";
  process.env.SMTP_SECURE = "false";
  await sendEmail({
    to: "recipient@example.invalid",
    subject: "Fixture",
    html: "Test",
  });
  assert.equal(options.secure, false);
  assert.equal(options.requireTLS, true);
});
