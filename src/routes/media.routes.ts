import { Router, Response, NextFunction } from "express";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { AuthenticatedRequest } from "../types";
import { authMiddleware } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";

const router = Router();
const adminOnly = [authMiddleware, requireAdmin];

const BUCKET = process.env.S3_MEDIA_BUCKET || "nb-media";
const REGION = process.env.S3_REGION || "eu-north-1";
const PUBLIC_URL_BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com`;

const s3 = new S3Client({ region: REGION });

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/avif"];
const ALLOWED_AUDIO_TYPES = ["audio/mpeg", "audio/mp3", "audio/m4a", "audio/aac", "audio/ogg"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_AUDIO_TYPES];

function sanitizeFilename(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]/g, "-");
}

// ---------------------------------------------------------------------------
// POST /admin/upload-url — genera presigned PUT URL per upload diretto a S3
// Input: { folder, filename, contentType }
// Output: { uploadUrl, publicUrl, s3Path }
// ---------------------------------------------------------------------------
router.post("/admin/upload-url", adminOnly, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { folder, filename, contentType } = req.body;

    if (!folder || !filename || !contentType) {
      res.status(400).json({ error: "folder, filename e contentType sono obbligatori" });
      return;
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      res.status(400).json({
        error: "Tipo di file non supportato. Usa JPEG, PNG, WebP per immagini o MP3/M4A/AAC per audio.",
      });
      return;
    }

    const sanitized = sanitizeFilename(filename);
    const key = `${folder}/${Date.now()}-${sanitized}`;

    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 600 });
    const publicUrl = `${PUBLIC_URL_BASE}/${key}`;

    res.json({ uploadUrl, publicUrl, s3Path: key });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/media — elimina un oggetto da S3
// Input: { url } oppure { s3Path }
// ---------------------------------------------------------------------------
router.delete("/admin/media", adminOnly, async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const { url, s3Path } = req.body;

    let key: string;

    if (s3Path) {
      key = s3Path;
    } else if (url) {
      const prefix = `${PUBLIC_URL_BASE}/`;
      if (!url.startsWith(prefix)) {
        res.status(400).json({ error: "URL non valido o non appartiene a questo bucket" });
        return;
      }
      key = url.slice(prefix.length);
    } else {
      res.status(400).json({ error: "url o s3Path sono obbligatori" });
      return;
    }

    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
