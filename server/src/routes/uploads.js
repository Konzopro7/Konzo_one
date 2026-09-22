import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireRole } from "../middleware/requireRole.js";
import { detectUploadType } from "../utils/uploadType.js";

const router = Router();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadRoot = path.resolve(__dirname, "../../uploads");

const uploadSchema = z.object({
  fileName: z.string().min(1).max(180),
  mimeType: z.string().min(3).max(120),
  dataBase64: z.string().min(1),
  purpose: z.enum(["logo", "receipt", "document"]).default("document")
});

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf"
]);

router.use(requireAuth);

router.post("/", requireRole("admin", "commercial", "finance"), async (req, res, next) => {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    if (!allowedMimeTypes.has(payload.mimeType)) {
      return res.status(400).json({ message: "Type de fichier non autorisé." });
    }

    const buffer = Buffer.from(payload.dataBase64, "base64");
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: "Fichier vide ou supérieur à 5 Mo." });
    }

    const detected = detectUploadType(buffer);
    if (!detected || detected.mime !== payload.mimeType ||
        (payload.purpose === "logo" && !detected.mime.startsWith("image/"))) {
      return res.status(400).json({ message: "Format invalide. Utilisez PNG, JPEG, WebP ou PDF (documents uniquement)." });
    }

    const agencyFolder = path.join(uploadRoot, String(req.user.agencyId), payload.purpose);
    await mkdir(agencyFolder, { recursive: true });

    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${detected.extension}`;
    const fullPath = path.join(agencyFolder, fileName);
    await writeFile(fullPath, buffer);

    const publicPath = `/uploads/${req.user.agencyId}/${payload.purpose}/${fileName}`;
    const apiUrl = (process.env.API_URL || "http://localhost:4000").replace(/\/+$/, "");

    return res.status(201).json({
      url: `${apiUrl}${publicPath}`,
      path: publicPath,
      mimeType: payload.mimeType,
      size: buffer.length
    });
  } catch (error) {
    return next(error);
  }
});

export { uploadRoot };
export default router;
