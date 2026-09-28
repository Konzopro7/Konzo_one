import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  newsletterStatus,
  subscribeNewsletter,
  newsletterTokenAction,
  dismissNewsletter,
  unsubscribeNewsletter,
} from "../services/newsletter.js";

const router = Router();
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
const handle = (work) => async (req, res, next) => {
  try {
    await work(req, res);
  } catch (error) {
    if (error.status) res.status(error.status).json({ message: error.message });
    else next(error);
  }
};
router.post(
  "/:action(confirm|unsubscribe)/token",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
  }),
  handle(async (req, res) => {
    const parsed = z
      .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ message: "Lien invalide ou expiré." });
    await newsletterTokenAction(parsed.data.token, req.params.action, req);
    res.json({
      message:
        req.params.action === "confirm"
          ? "Votre inscription à la newsletter est confirmée."
          : "Votre désabonnement est enregistré.",
    });
  }),
);
router.use(requireAuth);
router.get(
  "/status",
  handle(async (req, res) => res.json(await newsletterStatus(req.user))),
);
router.post(
  "/subscribe",
  rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    keyGenerator: (req) => String(req.user.id),
    standardHeaders: true,
    legacyHeaders: false,
  }),
  handle(async (req, res) => {
    if (
      !z
        .object({ consent: z.literal(true) })
        .strict()
        .safeParse(req.body).success
    )
      return res
        .status(400)
        .json({ message: "Votre accord est nécessaire pour vous inscrire." });
    const result = await subscribeNewsletter(req.user, req);
    res.json({
      message: result.alreadySubscribed
        ? "Vous êtes déjà inscrit."
        : "Un email vous a été envoyé. Cliquez sur le lien puis confirmez votre inscription.",
      ...(await newsletterStatus(req.user)),
    });
  }),
);
router.post(
  "/dismiss",
  handle(async (req, res) => {
    await dismissNewsletter(req.user);
    res.json({ ok: true });
  }),
);
router.post(
  "/unsubscribe",
  handle(async (req, res) => {
    await unsubscribeNewsletter(req.user, req);
    res.json({
      message: "Votre désabonnement est enregistré.",
      ...(await newsletterStatus(req.user)),
    });
  }),
);
export default router;
