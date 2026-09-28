import { Router } from "express";
import { query } from "../db.js";
const router = Router();
router.get("/contact", async (req, res, next) => {
  try {
    const { rows } = await query(
      "SELECT support_phone FROM platform_settings WHERE id=1",
    );
    res
      .set("Cache-Control", "no-store")
      .json({ phone: rows[0]?.support_phone || "" });
  } catch (error) {
    next(error);
  }
});
export default router;
