import crypto from "node:crypto";

export function verifyWhatsappWebhook(req, res, next) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return res.status(503).json({ message: "Webhook not configured." });
  const signature = req.headers["x-hub-signature-256"];
  if (typeof signature !== "string" || !/^sha256=[a-f0-9]{64}$/.test(signature) || !Buffer.isBuffer(req.rawBody)) {
    return res.status(401).json({ message: "Invalid webhook signature." });
  }
  const expected = crypto.createHmac("sha256", secret).update(req.rawBody).digest();
  const received = Buffer.from(signature.slice(7), "hex");
  if (!crypto.timingSafeEqual(expected, received)) {
    return res.status(401).json({ message: "Invalid webhook signature." });
  }
  return next();
}
