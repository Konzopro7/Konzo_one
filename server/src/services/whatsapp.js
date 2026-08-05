const DEFAULT_GRAPH_VERSION = "v23.0";

export function maskSecret(value) {
  if (!value) {
    return "";
  }

  const text = String(value);
  if (text.length <= 10) {
    return "********";
  }

  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export function normalizeWhatsappPhone(value) {
  return String(value || "").replace(/[^\d]/g, "");
}

export function getWebhookUrl() {
  const apiUrl = (process.env.API_URL || "http://localhost:4000").replace(/\/+$/, "");
  return `${apiUrl}/api/chatbot/whatsapp/webhook`;
}

export function extractInboundText(message) {
  if (!message || typeof message !== "object") {
    return "";
  }

  if (message.text?.body) {
    return message.text.body;
  }

  if (message.button?.text) {
    return message.button.text;
  }

  if (message.interactive?.button_reply?.title) {
    return message.interactive.button_reply.title;
  }

  if (message.interactive?.list_reply?.title) {
    return message.interactive.list_reply.title;
  }

  if (message.image?.caption) {
    return message.image.caption;
  }

  if (message.document?.caption) {
    return message.document.caption;
  }

  return `[${message.type || "message"}]`;
}

export function renderAutoReply(template, context = {}) {
  const source =
    template ||
    "Bonjour {{contactName}}, merci pour votre message. Nous revenons vers vous rapidement.";

  return source
    .replaceAll("{{contactName}}", context.contactName || "vous")
    .replaceAll("{{contactPhone}}", context.contactPhone || "")
    .replaceAll("{{message}}", context.message || "");
}

export async function sendWhatsappTextMessage(channel, toPhone, body) {
  const accessToken = channel?.access_token || process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = channel?.phone_number_id || process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
  const normalizedTo = normalizeWhatsappPhone(toPhone);

  if (!accessToken || !phoneNumberId || !normalizedTo) {
    return {
      sent: false,
      status: "simulated",
      providerMessageId: null,
      response: {
        mode: "simulation",
        reason: "WhatsApp access token, phone number id, or recipient is missing."
      }
    };
  }

  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: normalizedTo,
        type: "text",
        text: {
          preview_url: false,
          body
        }
      })
    }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.error?.message || "WhatsApp message send failed.");
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return {
    sent: true,
    status: "sent",
    providerMessageId: data?.messages?.[0]?.id || null,
    response: data
  };
}
