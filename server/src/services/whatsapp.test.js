import test from "node:test";
import assert from "node:assert/strict";
import {
  extractInboundText,
  hasWhatsappCredentials,
  maskSecret,
  normalizeWhatsappPhone,
  renderAutoReply,
  sendWhatsappTextMessage
} from "./whatsapp.js";

test("maskSecret hides most of a token", () => {
  assert.equal(maskSecret("abcd1234567890wxyz"), "abcd...wxyz");
  assert.equal(maskSecret("short"), "********");
});

test("normalizeWhatsappPhone keeps digits only", () => {
  assert.equal(normalizeWhatsappPhone("+33 6 12 34 56 78"), "33612345678");
});

test("extractInboundText supports common WhatsApp payload shapes", () => {
  assert.equal(extractInboundText({ type: "text", text: { body: "Salut" } }), "Salut");
  assert.equal(
    extractInboundText({ type: "interactive", interactive: { button_reply: { title: "Oui" } } }),
    "Oui"
  );
  assert.equal(extractInboundText({ type: "image", image: { caption: "Photo" } }), "Photo");
});

test("renderAutoReply replaces chatbot variables", () => {
  assert.equal(
    renderAutoReply("Bonjour {{contactName}}, message recu: {{message}}", {
      contactName: "Awa",
      message: "Devis"
    }),
    "Bonjour Awa, message recu: Devis"
  );
});

test("WhatsApp delivery requires both credentials and never silently simulates", async (t) => {
  const previousToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const previousPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  t.after(() => {
    if (previousToken === undefined) delete process.env.WHATSAPP_ACCESS_TOKEN;
    else process.env.WHATSAPP_ACCESS_TOKEN = previousToken;
    if (previousPhoneId === undefined) delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    else process.env.WHATSAPP_PHONE_NUMBER_ID = previousPhoneId;
  });

  assert.equal(hasWhatsappCredentials({ access_token: "token" }), false);
  assert.equal(hasWhatsappCredentials({ phone_number_id: "123" }), false);
  assert.equal(hasWhatsappCredentials({ access_token: "token", phone_number_id: "123" }), true);
  await assert.rejects(
    sendWhatsappTextMessage({ access_token: "token" }, "+1 514 555 0100", "Bonjour"),
    (error) => error.status === 503 && /Aucun message/.test(error.message)
  );
});
