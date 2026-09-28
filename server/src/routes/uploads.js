import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/requireAuth.js";
import { detectUploadType } from "../utils/uploadType.js";
import { uploadRoot } from "../utils/uploadPaths.js";

const router = Router();

const uploadSchema = z.object({
  fileName: z.string().min(1).max(180),
  mimeType: z.string().min(3).max(120),
  dataBase64: z.string().min(1),
  purpose: z.enum(["logo", "avatar", "receipt", "document"]).default("document")
});

const allowedMimeTypes = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf"
]);

router.use(requireAuth);

router.post("/", async (req, res, next) => {
  try {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        message: "Validation failed.",
        issues: parsed.error.flatten()
      });
    }

    const payload = parsed.data;
    if (payload.purpose === "logo" && req.user.role !== "admin") {
      return res.status(403).json({ message: "Seul un administrateur peut modifier le logo de l’entreprise." });
    }
    if (payload.purpose !== "avatar" && !["admin", "commercial", "finance"].includes(req.user.role)) {
      return res.status(403).json({ message: "Vous ne pouvez pas importer ce document." });
    }
    if (!allowedMimeTypes.has(payload.mimeType)) {
      return res.status(400).json({ message: "Type de fichier non autorisé." });
    }

    let buffer = Buffer.from(payload.dataBase64, "base64");
    if (buffer.length === 0 || buffer.length > 5 * 1024 * 1024) {
      return res.status(400).json({ message: "Fichier vide ou supérieur à 5 Mo." });
    }

    const detected = detectUploadType(buffer);
    if (!detected || detected.mime !== payload.mimeType ||
        (["logo", "avatar"].includes(payload.purpose) && !detected.mime.startsWith("image/"))) {
      return res.status(400).json({ message: "Format invalide. Utilisez PNG, JPEG, WebP ou PDF (documents uniquement)." });
    }

    let extension = detected.extension;
    let mimeType = detected.mime;
    if (["logo", "avatar"].includes(payload.purpose)) {
      try {
        buffer = await sharp(buffer, { limitInputPixels: 25_000_000, failOn: "error" })
          .rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true }).png().toBuffer();
        extension = ".png";
        mimeType = "image/png";
      } catch {
        return res.status(400).json({ message: "Image illisible ou trop grande. Choisissez une autre image PNG, JPG ou WebP." });
      }
    }
    const agencyFolder = path.join(uploadRoot, String(req.user.agencyId), payload.purpose,
      ...(payload.purpose === "avatar" ? [String(req.user.id)] : []));
    await mkdir(agencyFolder, { recursive: true });

    const fileName = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`;
    const fullPath = path.join(agencyFolder, fileName);
    await writeFile(fullPath, buffer);

    const publicPath = `/uploads/${req.user.agencyId}/${payload.purpose}/${payload.purpose === "avatar" ? `${req.user.id}/` : ""}${fileName}`;
    const apiUrl = (process.env.API_URL || "http://localhost:4000").replace(/\/+$/, "");

    return res.status(201).json({
      url: `${apiUrl}${publicPath}`,
      path: publicPath,
      mimeType,
      size: buffer.length
    });
  } catch (error) {
    return next(error);
  }
});

export { uploadRoot };
export default router;
