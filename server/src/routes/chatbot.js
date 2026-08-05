import crypto from "crypto";
import { Router } from "express";
import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import {
  extractInboundText,
  getWebhookUrl,
  maskSecret,
  normalizeWhatsappPhone,
  renderAutoReply,
  sendWhatsappTextMessage
} from "../services/whatsapp.js";

const router = Router();

const settingsSchema = z.object({
  displayPhoneNumber: z.string().max(80).optional().nullable(),
  phoneNumberId: z.string().max(120).optional().nullable(),
  businessAccountId: z.string().max(120).optional().nullable(),
  accessToken: z.string().max(10000).optional().nullable(),
  verifyToken: z.string().min(8).max(160).optional().nullable(),
  isActive: z.boolean().default(false),
  autoReplyEnabled: z.boolean().default(false),
  autoReplyMessage: z.string().min(3).max(1200).optional()
});

const sendMessageSchema = z.object({
  body: z.string().min(1).max(4000)
});

const testMessageSchema = z.object({
  contactPhone: z.string().min(5).max(80),
  contactName: z.string().max(180).optional().nullable(),
  body: z.string().min(1).max(4000)
});

function randomToken() {
  return crypto.randomBytes(24).toString("hex");
}

function parseId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function mapChannel(row) {
  return {
    id: row.id,
    provider: row.provider,
    displayPhoneNumber: row.display_phone_number,
    phoneNumberId: row.phone_number_id,
    businessAccountId: row.business_account_id,
    accessTokenMasked: maskSecret(row.access_token || process.env.WHATSAPP_ACCESS_TOKEN),
    hasAccessToken: Boolean(row.access_token || process.env.WHATSAPP_ACCESS_TOKEN),
    verifyToken: row.verify_token,
    isActive: Boolean(row.is_active),
    autoReplyEnabled: Boolean(row.auto_reply_enabled),
    autoReplyMessage: row.auto_reply_message,
    webhookUrl: getWebhookUrl(),
    updatedAt: row.updated_at
  };
}

function mapConversation(row) {
  return {
    id: row.id,
    contactPhone: row.contact_phone,
    contactName: row.contact_name,
    status: row.status,
    lastMessageAt: row.last_message_at,
    lastMessageBody: row.last_message_body,
    lastMessageDirection: row.last_message_direction,
    unreadCount: Number(row.unread_count || 0)
  };
}

function mapMessage(row) {
  return {
    id: row.id,
    providerMessageId: row.provider_message_id,
    direction: row.direction,
    messageType: row.message_type,
    body: row.body,
    status: row.status,
    sentBy: row.sent_by,
    sentByName: row.sent_by_name,
    createdAt: row.created_at
  };
}

async function ensureChannel(agencyId) {
  const existing = await query(
    `SELECT *
     FROM chatbot_channels
     WHERE agency_id = $1`,
    [agencyId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await query(
    `INSERT INTO chatbot_channels (agency_id, verify_token)
     VALUES ($1, $2)
     RETURNING *`,
    [agencyId, process.env.WHATSAPP_VERIFY_TOKEN || randomToken()]
  );

  return created.rows[0];
}

async function verifyWebhookToken(token) {
  if (!token) {
    return false;
  }

  if (process.env.WHATSAPP_VERIFY_TOKEN && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return true;
  }

  const { rows } = await query(
    `SELECT id
     FROM chatbot_channels
     WHERE verify_token = $1 AND is_active = TRUE
     LIMIT 1`,
    [token]
  );

  return Boolean(rows[0]);
}

async function findChannelByPhoneNumberId(phoneNumberId) {
  if (!phoneNumberId) {
    return null;
  }

  const { rows } = await query(
    `SELECT *
     FROM chatbot_channels
     WHERE phone_number_id = $1 AND is_active = TRUE
     LIMIT 1`,
    [phoneNumberId]
  );

  return rows[0] || null;
}

async function upsertConversation(client, channel, contactPhone, contactName) {
  const { rows } = await client.query(
    `INSERT INTO chatbot_conversations (
      agency_id,
      channel_id,
      contact_phone,
      contact_name,
      status,
      last_message_at
    )
    VALUES ($1, $2, $3, $4, 'open', NOW())
    ON CONFLICT (agency_id, channel_id, contact_phone)
    DO UPDATE SET
      contact_name = COALESCE(EXCLUDED.contact_name, chatbot_conversations.contact_name),
      status = 'open',
      last_message_at = NOW()
    RETURNING *`,
    [channel.agency_id, channel.id, contactPhone, contactName || null]
  );

  return rows[0];
}

async function insertInboundMessage(client, channel, conversation, providerMessageId, messageType, body, rawPayload) {
  const { rows } = await client.query(
    `INSERT INTO chatbot_messages (
      agency_id,
      conversation_id,
      provider_message_id,
      direction,
      message_type,
      body,
      status,
      raw_payload
    )
    VALUES ($1, $2, $3, 'inbound', $4, $5, 'received', $6)
    ON CONFLICT (provider_message_id) DO NOTHING
    RETURNING *`,
    [
      channel.agency_id,
      conversation.id,
      providerMessageId,
      messageType || "text",
      body,
      JSON.stringify(rawPayload || {})
    ]
  );

  return rows[0] || null;
}

async function insertOutboundMessage({
  agencyId,
  conversationId,
  providerMessageId,
  body,
  status,
  sentBy,
  rawPayload
}) {
  const { rows } = await query(
    `INSERT INTO chatbot_messages (
      agency_id,
      conversation_id,
      provider_message_id,
      direction,
      message_type,
      body,
      status,
      sent_by,
      raw_payload
    )
    VALUES ($1, $2, $3, 'outbound', 'text', $4, $5, $6, $7)
    RETURNING *`,
    [
      agencyId,
      conversationId,
      providerMessageId || null,
      body,
      status,
      sentBy || null,
      JSON.stringify(rawPayload || {})
    ]
  );

  await query(
    `UPDATE chatbot_conversations
     SET last_message_at = NOW()
     WHERE id = $1 AND agency_id = $2`,
    [conversationId, agencyId]
  );

  return rows[0];
}

async function autoReplyIfEnabled(channel, conversation, inboundBody, contactName, simulateOnly = false) {
  if (!channel.auto_reply_enabled) {
    return null;
  }

  const body = renderAutoReply(channel.auto_reply_message, {
    contactName,
    contactPhone: conversation.contact_phone,
    message: inboundBody
  });

  const result = simulateOnly
    ? {
        sent: false,
        status: "simulated",
        providerMessageId: null,
        response: { mode: "simulation" }
      }
    : await sendWhatsappTextMessage(channel, conversation.contact_phone, body);

  return insertOutboundMessage({
    agencyId: channel.agency_id,
    conversationId: conversation.id,
    providerMessageId: result.providerMessageId,
    body,
    status: result.status,
    sentBy: null,
    rawPayload: result.response
  });
}

async function handleInboundWhatsappMessage(channel, value, message) {
  const contactPhone = normalizeWhatsappPhone(message.from);
  if (!contactPhone) {
    return null;
  }

  const contact = (value.contacts || []).find((entry) => entry.wa_id === message.from);
  const contactName = contact?.profile?.name || null;
  const body = extractInboundText(message);

  const result = await withTransaction(async (client) => {
    const conversation = await upsertConversation(client, channel, contactPhone, contactName);
    const inserted = await insertInboundMessage(
      client,
      channel,
      conversation,
      message.id,
      message.type || "text",
      body,
      message
    );

    return { conversation, inserted };
  });

  if (result.inserted) {
    await autoReplyIfEnabled(channel, result.conversation, body, contactName);
  }

  return result;
}

async function updateWhatsappStatuses(channel, statuses = []) {
  await Promise.all(
    statuses.map((status) =>
      query(
        `UPDATE chatbot_messages
         SET status = $1,
             raw_payload = COALESCE(raw_payload, '{}'::jsonb) || $2::jsonb
         WHERE agency_id = $3 AND provider_message_id = $4`,
        [
          status.status || "sent",
          JSON.stringify({ whatsappStatus: status }),
          channel.agency_id,
          status.id
        ]
      ).catch(() => null)
    )
  );
}

router.get("/whatsapp/webhook", async (req, res, next) => {
  try {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && (await verifyWebhookToken(token))) {
      return res.status(200).send(String(challenge || ""));
    }

    return res.status(403).send("Forbidden");
  } catch (error) {
    return next(error);
  }
});

router.post("/whatsapp/webhook", async (req, res, next) => {
  try {
    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];

    for (const entry of entries) {
      const changes = Array.isArray(entry.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change.value || {};
        const phoneNumberId = value.metadata?.phone_number_id;
        const channel = await findChannelByPhoneNumberId(phoneNumberId);
        if (!channel) {
          continue;
        }

        if (Array.isArray(value.statuses) && value.statuses.length > 0) {
          await updateWhatsappStatuses(channel, value.statuses);
        }

        const messages = Array.isArray(value.messages) ? value.messages : [];
        for (const message of messages) {
          await handleInboundWhatsappMessage(channel, value, message);
        }
      }
    }

    return res.sendStatus(200);
  } catch (error) {
    return next(error);
  }
});

router.use(requireAuth);

router.get("/settings", async (req, res, next) => {
  try {
    const channel = await ensureChannel(req.user.agencyId);
    return res.json(mapChannel(channel));
  } catch (error) {
    return next(error);
  }
});

router.put("/settings", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const existing = await ensureChannel(req.user.agencyId);
    const accessToken = payload.accessToken?.trim() || existing.access_token || null;
    const verifyToken = payload.verifyToken?.trim() || existing.verify_token || randomToken();

    const { rows } = await query(
      `INSERT INTO chatbot_channels (
        agency_id,
        provider,
        display_phone_number,
        phone_number_id,
        business_account_id,
        access_token,
        verify_token,
        is_active,
        auto_reply_enabled,
        auto_reply_message
      )
      VALUES ($1, 'whatsapp_cloud', $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (agency_id)
      DO UPDATE SET
        display_phone_number = EXCLUDED.display_phone_number,
        phone_number_id = EXCLUDED.phone_number_id,
        business_account_id = EXCLUDED.business_account_id,
        access_token = EXCLUDED.access_token,
        verify_token = EXCLUDED.verify_token,
        is_active = EXCLUDED.is_active,
        auto_reply_enabled = EXCLUDED.auto_reply_enabled,
        auto_reply_message = EXCLUDED.auto_reply_message
      RETURNING *`,
      [
        req.user.agencyId,
        payload.displayPhoneNumber?.trim() || null,
        payload.phoneNumberId?.trim() || null,
        payload.businessAccountId?.trim() || null,
        accessToken,
        verifyToken,
        payload.isActive,
        payload.autoReplyEnabled,
        payload.autoReplyMessage?.trim() ||
          "Bonjour {{contactName}}, merci pour votre message. Nous revenons vers vous rapidement."
      ]
    );

    return res.json(mapChannel(rows[0]));
  } catch (error) {
    return next(error);
  }
});

router.get("/conversations", async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT
        c.id,
        c.contact_phone,
        c.contact_name,
        c.status,
        c.last_message_at,
        last_msg.body AS last_message_body,
        last_msg.direction AS last_message_direction,
        COUNT(m.id) FILTER (WHERE m.direction = 'inbound' AND m.status = 'received')::INT AS unread_count
      FROM chatbot_conversations c
      LEFT JOIN LATERAL (
        SELECT body, direction
        FROM chatbot_messages
        WHERE conversation_id = c.id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) last_msg ON TRUE
      LEFT JOIN chatbot_messages m ON m.conversation_id = c.id
      WHERE c.agency_id = $1
      GROUP BY c.id, last_msg.body, last_msg.direction
      ORDER BY c.last_message_at DESC, c.id DESC`,
      [req.user.agencyId]
    );

    return res.json(rows.map(mapConversation));
  } catch (error) {
    return next(error);
  }
});

router.get("/conversations/:id/messages", async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid conversation id." });
    }

    const conversation = await query(
      `SELECT id
       FROM chatbot_conversations
       WHERE id = $1 AND agency_id = $2`,
      [id, req.user.agencyId]
    );

    if (!conversation.rows[0]) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    await query(
      `UPDATE chatbot_messages
       SET status = 'read'
       WHERE conversation_id = $1 AND agency_id = $2 AND direction = 'inbound' AND status = 'received'`,
      [id, req.user.agencyId]
    );

    const { rows } = await query(
      `SELECT
        m.id,
        m.provider_message_id,
        m.direction,
        m.message_type,
        m.body,
        m.status,
        m.sent_by,
        u.full_name AS sent_by_name,
        m.created_at
       FROM chatbot_messages m
       LEFT JOIN users u ON u.id = m.sent_by
       WHERE m.conversation_id = $1 AND m.agency_id = $2
       ORDER BY m.created_at ASC, m.id ASC`,
      [id, req.user.agencyId]
    );

    return res.json(rows.map(mapMessage));
  } catch (error) {
    return next(error);
  }
});

router.post("/conversations/:id/messages", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid conversation id." });
    }

    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const conversationRes = await query(
      `SELECT
        c.*,
        ch.phone_number_id,
        ch.access_token,
        ch.is_active
       FROM chatbot_conversations c
       INNER JOIN chatbot_channels ch ON ch.id = c.channel_id
       WHERE c.id = $1 AND c.agency_id = $2`,
      [id, req.user.agencyId]
    );

    const conversation = conversationRes.rows[0];
    if (!conversation) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    const hasRealWhatsappConfig = Boolean(
      conversation.access_token ||
        process.env.WHATSAPP_ACCESS_TOKEN ||
        conversation.phone_number_id ||
        process.env.WHATSAPP_PHONE_NUMBER_ID
    );

    if (!conversation.is_active && hasRealWhatsappConfig) {
      return res.status(409).json({ message: "Le canal WhatsApp n'est pas actif." });
    }

    let sendResult;
    try {
      sendResult = await sendWhatsappTextMessage(conversation, conversation.contact_phone, parsed.data.body.trim());
    } catch (error) {
      await insertOutboundMessage({
        agencyId: req.user.agencyId,
        conversationId: conversation.id,
        providerMessageId: null,
        body: parsed.data.body.trim(),
        status: "failed",
        sentBy: req.user.id,
        rawPayload: error.details || { message: error.message }
      });
      return res.status(502).json({ message: error.message || "Envoi WhatsApp impossible." });
    }

    const message = await insertOutboundMessage({
      agencyId: req.user.agencyId,
      conversationId: conversation.id,
      providerMessageId: sendResult.providerMessageId,
      body: parsed.data.body.trim(),
      status: sendResult.status,
      sentBy: req.user.id,
      rawPayload: sendResult.response
    });

    return res.status(201).json(mapMessage(message));
  } catch (error) {
    return next(error);
  }
});

router.patch("/conversations/:id/status", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const id = parseId(req.params.id);
    if (!id) {
      return res.status(400).json({ message: "Invalid conversation id." });
    }

    const parsed = z.object({ status: z.enum(["open", "closed"]) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid status." });
    }

    const { rows } = await query(
      `UPDATE chatbot_conversations
       SET status = $1
       WHERE id = $2 AND agency_id = $3
       RETURNING
        id,
        contact_phone,
        contact_name,
        status,
        last_message_at,
        NULL::TEXT AS last_message_body,
        NULL::TEXT AS last_message_direction,
        0::INT AS unread_count`,
      [parsed.data.status, id, req.user.agencyId]
    );

    if (!rows[0]) {
      return res.status(404).json({ message: "Conversation not found." });
    }

    return res.json(mapConversation(rows[0]));
  } catch (error) {
    return next(error);
  }
});

router.post("/test-message", requireRole("admin", "commercial"), async (req, res, next) => {
  try {
    const parsed = testMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const channel = await ensureChannel(req.user.agencyId);
    const contactPhone = normalizeWhatsappPhone(parsed.data.contactPhone);
    if (!contactPhone) {
      return res.status(400).json({ message: "Telephone invalide." });
    }
    const providerMessageId = `local-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;

    const result = await withTransaction(async (client) => {
      const conversation = await upsertConversation(
        client,
        channel,
        contactPhone,
        parsed.data.contactName?.trim() || "Client test"
      );
      const message = await insertInboundMessage(
        client,
        channel,
        conversation,
        providerMessageId,
        "text",
        parsed.data.body.trim(),
        { source: "manual_test" }
      );

      return { conversation, message };
    });

    if (channel.auto_reply_enabled) {
      await autoReplyIfEnabled(
        channel,
        result.conversation,
        parsed.data.body.trim(),
        parsed.data.contactName?.trim() || "Client test",
        true
      );
    }

    return res.status(201).json({
      conversationId: result.conversation.id,
      message: mapMessage(result.message)
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
