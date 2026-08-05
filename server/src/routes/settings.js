import { Router } from "express";
import { z } from "zod";
import { query } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";

const router = Router();

router.use(requireAuth);

const settingsSchema = z.object({
  logoUrl: z.string().url().optional().nullable().or(z.literal("")),
  agencyName: z.string().min(2, "Agency name is required."),
  agencyEmail: z.string().email("Invalid email."),
  agencyPhone: z.string().optional().nullable(),
  paymentTerms: z.string().min(3, "Payment terms are required."),
  currency: z.string().min(3).max(3).optional().default("CAD"),
  reminderEnabled: z.boolean().default(true),
  quoteFollowupDays: z.coerce.number().int().min(1).max(60).default(5),
  invoiceDueDaysBefore: z.coerce.number().int().min(1).max(30).default(3),
  quoteEmailSubject: z.string().min(3).max(240).optional(),
  quoteEmailBody: z.string().min(3).max(5000).optional(),
  invoiceEmailSubject: z.string().min(3).max(240).optional(),
  invoiceEmailBody: z.string().min(3).max(5000).optional(),
  reminderEmailSubject: z.string().min(3).max(240).optional(),
  reminderEmailBody: z.string().min(3).max(5000).optional()
});

async function ensureSettings(agencyId) {
  const settings = await query(
    `SELECT
      logo_url,
      agency_name,
      agency_email,
      agency_phone,
      payment_terms,
      currency,
      reminder_enabled,
      quote_followup_days,
      invoice_due_days_before,
      quote_email_subject,
      quote_email_body,
      invoice_email_subject,
      invoice_email_body,
      reminder_email_subject,
      reminder_email_body
     FROM agency_settings
     WHERE agency_id = $1`,
    [agencyId]
  );

  if (settings.rows[0]) {
    return settings.rows[0];
  }

  const agency = await query(
    `SELECT name
     FROM agencies
     WHERE id = $1`,
    [agencyId]
  );
  if (!agency.rows[0]) {
    return null;
  }

  const created = await query(
    `INSERT INTO agency_settings (agency_id, agency_name)
     VALUES ($1, $2)
     RETURNING
      logo_url,
      agency_name,
      agency_email,
      agency_phone,
      payment_terms,
      currency,
      reminder_enabled,
      quote_followup_days,
      invoice_due_days_before,
      quote_email_subject,
      quote_email_body,
      invoice_email_subject,
      invoice_email_body,
      reminder_email_subject,
      reminder_email_body`,
    [agencyId, agency.rows[0].name]
  );

  return created.rows[0];
}

router.get("/", async (req, res, next) => {
  try {
    const settings = await ensureSettings(req.user.agencyId);
    if (!settings) {
      return res.status(404).json({ message: "Settings not found." });
    }

    return res.json({
      logoUrl: settings.logo_url,
      agencyName: settings.agency_name,
      agencyEmail: settings.agency_email,
      agencyPhone: settings.agency_phone,
      paymentTerms: settings.payment_terms,
      currency: "CAD",
      reminderEnabled: settings.reminder_enabled,
      quoteFollowupDays: Number(settings.quote_followup_days || 5),
      invoiceDueDaysBefore: Number(settings.invoice_due_days_before || 3),
      quoteEmailSubject: settings.quote_email_subject,
      quoteEmailBody: settings.quote_email_body,
      invoiceEmailSubject: settings.invoice_email_subject,
      invoiceEmailBody: settings.invoice_email_body,
      reminderEmailSubject: settings.reminder_email_subject,
      reminderEmailBody: settings.reminder_email_body,
      stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY)
    });
  } catch (error) {
    return next(error);
  }
});

router.put("/", requireRole("admin"), async (req, res, next) => {
  try {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    const { rows } = await query(
      `INSERT INTO agency_settings (
        agency_id,
        logo_url,
        agency_name,
        agency_email,
        agency_phone,
        payment_terms,
        currency,
        reminder_enabled,
        quote_followup_days,
        invoice_due_days_before,
        quote_email_subject,
        quote_email_body,
        invoice_email_subject,
        invoice_email_body,
        reminder_email_subject,
        reminder_email_body
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (agency_id)
      DO UPDATE SET
        logo_url = EXCLUDED.logo_url,
        agency_name = EXCLUDED.agency_name,
        agency_email = EXCLUDED.agency_email,
        agency_phone = EXCLUDED.agency_phone,
        payment_terms = EXCLUDED.payment_terms,
        currency = EXCLUDED.currency,
        reminder_enabled = EXCLUDED.reminder_enabled,
        quote_followup_days = EXCLUDED.quote_followup_days,
        invoice_due_days_before = EXCLUDED.invoice_due_days_before,
        quote_email_subject = EXCLUDED.quote_email_subject,
        quote_email_body = EXCLUDED.quote_email_body,
        invoice_email_subject = EXCLUDED.invoice_email_subject,
        invoice_email_body = EXCLUDED.invoice_email_body,
        reminder_email_subject = EXCLUDED.reminder_email_subject,
        reminder_email_body = EXCLUDED.reminder_email_body
      RETURNING
        logo_url,
        agency_name,
        agency_email,
        agency_phone,
        payment_terms,
        currency,
        reminder_enabled,
        quote_followup_days,
        invoice_due_days_before,
        quote_email_subject,
        quote_email_body,
        invoice_email_subject,
        invoice_email_body,
        reminder_email_subject,
        reminder_email_body`,
      [
        req.user.agencyId,
        payload.logoUrl || null,
        payload.agencyName.trim(),
        payload.agencyEmail.trim().toLowerCase(),
        payload.agencyPhone?.trim() || null,
        payload.paymentTerms.trim(),
        "CAD",
        payload.reminderEnabled,
        payload.quoteFollowupDays,
        payload.invoiceDueDaysBefore,
        payload.quoteEmailSubject || "Votre devis {{documentNumber}} - {{agencyName}}",
        payload.quoteEmailBody ||
          "<p>Bonjour {{clientName}},</p><p>Votre devis {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>",
        payload.invoiceEmailSubject || "Votre facture {{documentNumber}} - {{agencyName}}",
        payload.invoiceEmailBody ||
          "<p>Bonjour {{clientName}},</p><p>Votre facture {{documentNumber}} est disponible.</p><p>{{portalUrl}}</p>",
        payload.reminderEmailSubject || "Rappel {{documentNumber}} - {{agencyName}}",
        payload.reminderEmailBody ||
          "<p>Bonjour {{clientName}},</p><p>Ceci est un rappel concernant {{documentNumber}}.</p>"
      ]
    );

    const saved = rows[0];
    await query(
      "UPDATE agencies SET name = $1 WHERE id = $2",
      [payload.agencyName.trim(), req.user.agencyId]
    );

    return res.json({
      logoUrl: saved.logo_url,
      agencyName: saved.agency_name,
      agencyEmail: saved.agency_email,
      agencyPhone: saved.agency_phone,
      paymentTerms: saved.payment_terms,
      currency: "CAD",
      reminderEnabled: saved.reminder_enabled,
      quoteFollowupDays: Number(saved.quote_followup_days || 5),
      invoiceDueDaysBefore: Number(saved.invoice_due_days_before || 3),
      quoteEmailSubject: saved.quote_email_subject,
      quoteEmailBody: saved.quote_email_body,
      invoiceEmailSubject: saved.invoice_email_subject,
      invoiceEmailBody: saved.invoice_email_body,
      reminderEmailSubject: saved.reminder_email_subject,
      reminderEmailBody: saved.reminder_email_body,
      stripeEnabled: Boolean(process.env.STRIPE_SECRET_KEY)
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
