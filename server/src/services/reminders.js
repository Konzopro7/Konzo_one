import cron from "node-cron";
import { query } from "../db.js";
import { sendEmail } from "./mailer.js";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function invoiceSubject(reminderType, invoiceNumber) {
  return reminderType === "invoice_overdue"
    ? `Reminder: invoice ${invoiceNumber} is overdue`
    : `Reminder: invoice ${invoiceNumber} is due soon`;
}

function invoiceBody({ reminderType, clientName, invoiceNumber, dueDate, total, currency, agencyName }) {
  const dueLabel = dueDate ? new Date(dueDate).toLocaleDateString("en-CA") : "N/A";
  const amount = new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD"
  }).format(Number(total || 0));

  const intro =
    reminderType === "invoice_overdue"
      ? "This is a friendly reminder that your payment is now overdue."
      : "This is a friendly reminder that your payment due date is approaching.";

  return `
    <div style="font-family:Arial,sans-serif;color:#1F2A37">
      <h2 style="color:#0B3C5D;margin-bottom:8px">Hello ${clientName || "there"},</h2>
      <p>${intro}</p>
      <p><strong>Invoice:</strong> ${invoiceNumber}<br/>
      <strong>Due date:</strong> ${dueLabel}<br/>
      <strong>Amount:</strong> ${amount}</p>
      <p>Please contact us if you already processed the payment.</p>
      <p>Best regards,<br/>${agencyName || "Konzotech Agency"}</p>
    </div>
  `;
}

function quoteBody({ clientName, quoteNumber, total, currency, agencyName }) {
  const amount = new Intl.NumberFormat("fr-CA", {
    style: "currency",
    currency: "CAD"
  }).format(Number(total || 0));

  return `
    <div style="font-family:Arial,sans-serif;color:#1F2A37">
      <h2 style="color:#0B3C5D;margin-bottom:8px">Hello ${clientName || "there"},</h2>
      <p>We wanted to follow up regarding your quote <strong>${quoteNumber}</strong>.</p>
      <p>Total proposal amount: <strong>${amount}</strong>.</p>
      <p>Let us know if you need any adjustments to proceed.</p>
      <p>Best regards,<br/>${agencyName || "Konzotech Agency"}</p>
    </div>
  `;
}

async function hasReminderBeenSentToday({
  agencyId,
  entityType,
  entityId,
  reminderType
}) {
  const { rows } = await query(
    `SELECT id
     FROM reminder_logs
     WHERE agency_id = $1
       AND entity_type = $2
       AND entity_id = $3
       AND reminder_type = $4
       AND sent_day = CURRENT_DATE`,
    [agencyId, entityType, entityId, reminderType]
  );
  return Boolean(rows[0]);
}

async function logReminder({
  agencyId,
  entityType,
  entityId,
  reminderType,
  recipientEmail
}) {
  await query(
    `INSERT INTO reminder_logs (agency_id, entity_type, entity_id, reminder_type, recipient_email, sent_day)
     VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
     ON CONFLICT (agency_id, entity_type, entity_id, reminder_type, sent_day)
     DO NOTHING`,
    [agencyId, entityType, entityId, reminderType, recipientEmail || null]
  );
}

async function getAgencySettings(agencyId) {
  const { rows } = await query(
    `SELECT agency_name, currency, reminder_enabled, quote_followup_days, invoice_due_days_before
     FROM agency_settings
     WHERE agency_id = $1`,
    [agencyId]
  );
  return rows[0] || null;
}

async function collectInvoiceCandidates(agencyId, dueDaysBefore) {
  const { rows } = await query(
    `SELECT
      i.id,
      i.invoice_number,
      i.total,
      i.due_date,
      c.name AS client_name,
      c.email AS client_email
    FROM invoices i
    INNER JOIN clients c ON c.id = i.client_id
    WHERE i.agency_id = $1
      AND i.status = 'pending'
      AND c.email IS NOT NULL
      AND i.due_date IS NOT NULL
      AND (
        i.due_date = CURRENT_DATE + ($2::INT * INTERVAL '1 day')
        OR i.due_date < CURRENT_DATE
      )
    ORDER BY i.due_date ASC`,
    [agencyId, dueDaysBefore]
  );

  return rows;
}

async function collectQuoteCandidates(agencyId, followupDays) {
  const { rows } = await query(
    `SELECT
      q.id,
      q.quote_number,
      q.total,
      c.name AS client_name,
      c.email AS client_email
    FROM quotes q
    INNER JOIN clients c ON c.id = q.client_id
    LEFT JOIN invoices i ON i.quote_id = q.id
    WHERE q.agency_id = $1
      AND q.status = 'sent'
      AND q.issue_date <= CURRENT_DATE - ($2::INT * INTERVAL '1 day')
      AND c.email IS NOT NULL
      AND i.id IS NULL
    ORDER BY q.issue_date ASC`,
    [agencyId, followupDays]
  );
  return rows;
}

async function runAgencyReminderSweep(agencyId) {
  const settings = await getAgencySettings(agencyId);
  if (!settings || !settings.reminder_enabled) {
    return {
      agencyId,
      skipped: true,
      invoicesReminded: 0,
      quotesReminded: 0
    };
  }

  const invoiceCandidates = await collectInvoiceCandidates(
    agencyId,
    Number(settings.invoice_due_days_before || 3)
  );
  const quoteCandidates = await collectQuoteCandidates(
    agencyId,
    Number(settings.quote_followup_days || 5)
  );

  let invoicesReminded = 0;
  let quotesReminded = 0;

  for (const invoice of invoiceCandidates) {
    const reminderType =
      new Date(invoice.due_date) < new Date(todayIsoDate())
        ? "invoice_overdue"
        : "invoice_due_soon";

    const alreadySent = await hasReminderBeenSentToday({
      agencyId,
      entityType: "invoice",
      entityId: invoice.id,
      reminderType
    });
    if (alreadySent) {
      continue;
    }

    await sendEmail({
      to: invoice.client_email,
      subject: invoiceSubject(reminderType, invoice.invoice_number),
      html: invoiceBody({
        reminderType,
        clientName: invoice.client_name,
        invoiceNumber: invoice.invoice_number,
        dueDate: invoice.due_date,
        total: invoice.total,
        currency: settings.currency,
        agencyName: settings.agency_name
      })
    });

    await logReminder({
      agencyId,
      entityType: "invoice",
      entityId: invoice.id,
      reminderType,
      recipientEmail: invoice.client_email
    });
    invoicesReminded += 1;
  }

  for (const quote of quoteCandidates) {
    const reminderType = "quote_followup";
    const alreadySent = await hasReminderBeenSentToday({
      agencyId,
      entityType: "quote",
      entityId: quote.id,
      reminderType
    });
    if (alreadySent) {
      continue;
    }

    await sendEmail({
      to: quote.client_email,
      subject: `Follow-up: quote ${quote.quote_number}`,
      html: quoteBody({
        clientName: quote.client_name,
        quoteNumber: quote.quote_number,
        total: quote.total,
        currency: settings.currency,
        agencyName: settings.agency_name
      })
    });

    await logReminder({
      agencyId,
      entityType: "quote",
      entityId: quote.id,
      reminderType,
      recipientEmail: quote.client_email
    });
    quotesReminded += 1;
  }

  return {
    agencyId,
    skipped: false,
    invoicesReminded,
    quotesReminded
  };
}

async function listAgencyIdsWithEnabledReminders() {
  const { rows } = await query(
    `SELECT agency_id
     FROM agency_settings
     WHERE reminder_enabled = true`
  );
  return rows.map((row) => row.agency_id);
}

export async function runReminderSweep({ agencyId = null } = {}) {
  const agencyIds = agencyId ? [agencyId] : await listAgencyIdsWithEnabledReminders();
  const results = [];
  for (const id of agencyIds) {
    const result = await runAgencyReminderSweep(id);
    results.push(result);
  }

  return {
    processedAgencies: results.length,
    invoicesReminded: results.reduce((sum, row) => sum + row.invoicesReminded, 0),
    quotesReminded: results.reduce((sum, row) => sum + row.quotesReminded, 0),
    details: results
  };
}

export async function getReminderLogs(agencyId, limit = 20) {
  const safeLimit = Number.isFinite(Number(limit))
    ? Math.min(Math.max(Number(limit), 1), 100)
    : 20;

  const { rows } = await query(
    `SELECT id, entity_type, entity_id, reminder_type, recipient_email, sent_day, sent_at
     FROM reminder_logs
     WHERE agency_id = $1
     ORDER BY sent_at DESC
     LIMIT $2`,
    [agencyId, safeLimit]
  );
  return rows;
}

export async function getReminderSummary(agencyId) {
  const settings = await getAgencySettings(agencyId);
  if (!settings) {
    return {
      reminderEnabled: false,
      invoiceDueSoonCount: 0,
      invoiceOverdueCount: 0,
      quoteFollowupCount: 0,
      recentLogs: []
    };
  }

  const dueDaysBefore = Number(settings.invoice_due_days_before || 3);
  const quoteDays = Number(settings.quote_followup_days || 5);

  const [dueSoonRes, overdueRes, quoteRes, recentLogs] = await Promise.all([
    query(
      `SELECT COUNT(*)::INT AS count
       FROM invoices
       WHERE agency_id = $1
         AND status = 'pending'
         AND due_date = CURRENT_DATE + ($2::INT * INTERVAL '1 day')`,
      [agencyId, dueDaysBefore]
    ),
    query(
      `SELECT COUNT(*)::INT AS count
       FROM invoices
       WHERE agency_id = $1
         AND status = 'pending'
         AND due_date < CURRENT_DATE`,
      [agencyId]
    ),
    query(
      `SELECT COUNT(*)::INT AS count
       FROM quotes q
       LEFT JOIN invoices i ON i.quote_id = q.id
       WHERE q.agency_id = $1
         AND q.status = 'sent'
         AND q.issue_date <= CURRENT_DATE - ($2::INT * INTERVAL '1 day')
         AND i.id IS NULL`,
      [agencyId, quoteDays]
    ),
    getReminderLogs(agencyId, 10)
  ]);

  return {
    reminderEnabled: settings.reminder_enabled,
    invoiceDueSoonCount: Number(dueSoonRes.rows[0]?.count || 0),
    invoiceOverdueCount: Number(overdueRes.rows[0]?.count || 0),
    quoteFollowupCount: Number(quoteRes.rows[0]?.count || 0),
    recentLogs: recentLogs.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      reminderType: row.reminder_type,
      recipientEmail: row.recipient_email,
      sentDay: row.sent_day,
      sentAt: row.sent_at
    }))
  };
}

let cronTask;

export function startReminderScheduler() {
  const isEnabled = String(process.env.REMINDERS_ENABLED || "true").toLowerCase() !== "false";
  if (!isEnabled) {
    return;
  }

  const schedule = process.env.REMINDERS_CRON || "0 */6 * * *";
  if (!cron.validate(schedule)) {
    console.warn(`Invalid REMINDERS_CRON value: ${schedule}`);
    return;
  }

  if (cronTask) {
    cronTask.stop();
  }

  cronTask = cron.schedule(schedule, async () => {
    try {
      const result = await runReminderSweep();
      console.log(
        `[reminders] agencies=${result.processedAgencies} invoices=${result.invoicesReminded} quotes=${result.quotesReminded}`
      );
    } catch (error) {
      console.error("[reminders] failed", error);
    }
  });
}
