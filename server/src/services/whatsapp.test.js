import test from "node:test";
import assert from "node:assert/strict";
import {
  extractInboundText,
  maskSecret,
  normalizeWhatsappPhone,
  renderAutoReply
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
