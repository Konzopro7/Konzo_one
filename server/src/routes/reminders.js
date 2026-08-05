import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { getReminderLogs, getReminderSummary, runReminderSweep } from "../services/reminders.js";

const router = Router();

router.use(requireAuth);

router.get("/summary", async (req, res, next) => {
  try {
    const summary = await getReminderSummary(req.user.agencyId);
    return res.json(summary);
  } catch (error) {
    return next(error);
  }
});

router.get("/logs", async (req, res, next) => {
  try {
    const limit = Number(req.query.limit || 20);
    const logs = await getReminderLogs(req.user.agencyId, limit);
    return res.json(
      logs.map((row) => ({
        id: row.id,
        entityType: row.entity_type,
        entityId: row.entity_id,
        reminderType: row.reminder_type,
        recipientEmail: row.recipient_email,
        sentDay: row.sent_day,
        sentAt: row.sent_at
      }))
    );
  } catch (error) {
    return next(error);
  }
});

router.post("/run", requireRole("admin"), async (req, res, next) => {
  try {
    const result = await runReminderSweep({ agencyId: req.user.agencyId });
    return res.json({
      message: "Reminders executed.",
      ...result
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
