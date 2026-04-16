import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getPool } from "../db/pool";
import { authMiddleware } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { createHttpError } from "../middleware/error-handler";

const router = Router();
const adminOnly = [authMiddleware, requireAdmin];

const BUCKET = process.env.S3_MEDIA_BUCKET || "nb-media";
const REGION = process.env.S3_REGION || "eu-north-1";
const s3 = new S3Client({ region: REGION });

const JSON_FIELDS = ["streamingLinks"];

function parseAlbum(row: any): any {
  const parsed = { ...row };
  for (const field of JSON_FIELDS) {
    if (typeof parsed[field] === "string") {
      try {
        parsed[field] = JSON.parse(parsed[field]);
      } catch {
        // lascia stringa
      }
    }
  }
  return parsed;
}

function extractS3Key(url: string): string {
  const PUBLIC_URL_BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`;
  return url.startsWith(PUBLIC_URL_BASE) ? url.slice(PUBLIC_URL_BASE.length) : url;
}

// ---------------------------------------------------------------------------
// GET /music-albums — lista pubblica ordinata
// ---------------------------------------------------------------------------
router.get("/music-albums", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM album_musicali ORDER BY ordine ASC"
    ) as [any[], any];
    res.json(rows.map(parseAlbum));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/music-albums — lista admin
// ---------------------------------------------------------------------------
router.get("/admin/music-albums", adminOnly, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM album_musicali ORDER BY ordine ASC"
    ) as [any[], any];
    res.json(rows.map(parseAlbum));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/music-albums/:publicId — dettaglio admin
// ---------------------------------------------------------------------------
router.get("/admin/music-albums/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM album_musicali WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!rows.length) return next(createHttpError(404, "Album musicale non trovato"));
    res.json(parseAlbum(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/music-albums — crea album musicale
// ---------------------------------------------------------------------------
router.post("/admin/music-albums", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { titolo, fotoS3Path, streamingLinks, audioPreviewS3Path, ordine } = req.body;
    if (!titolo) return next(createHttpError(400, "titolo è obbligatorio"));

    const publicId = randomUUID();
    const pool = getPool();

    const [result] = await pool.execute(
      `INSERT INTO album_musicali (publicId, titolo, fotoS3Path, streamingLinks, audioPreviewS3Path, ordine)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        publicId, titolo, fotoS3Path ?? null,
        streamingLinks ? JSON.stringify(streamingLinks) : null,
        audioPreviewS3Path ?? null, ordine ?? 0,
      ]
    ) as [any, any];

    const [rows] = await pool.execute("SELECT * FROM album_musicali WHERE id = ?", [result.insertId]) as [any[], any];
    res.status(201).json(parseAlbum(rows[0]));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/music-albums/:publicId — aggiorna album musicale
// ---------------------------------------------------------------------------
router.put("/admin/music-albums/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { titolo, fotoS3Path, streamingLinks, audioPreviewS3Path, ordine } = req.body;
    if (!titolo) return next(createHttpError(400, "titolo è obbligatorio"));

    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id FROM album_musicali WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Album musicale non trovato"));

    await pool.execute(
      `UPDATE album_musicali SET titolo=?, fotoS3Path=?, streamingLinks=?, audioPreviewS3Path=?, ordine=?
       WHERE id=?`,
      [
        titolo, fotoS3Path ?? null,
        streamingLinks ? JSON.stringify(streamingLinks) : null,
        audioPreviewS3Path ?? null, ordine ?? 0, existing[0].id,
      ]
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/music-albums/:publicId — elimina album e file S3 associati
// ---------------------------------------------------------------------------
router.delete("/admin/music-albums/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id, fotoS3Path, audioPreviewS3Path FROM album_musicali WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Album musicale non trovato"));

    await pool.execute("DELETE FROM album_musicali WHERE id = ?", [existing[0].id]);

    // Cancella file S3 in background
    for (const field of ["fotoS3Path", "audioPreviewS3Path"] as const) {
      const path = existing[0][field];
      if (path) {
        const key = path.startsWith("http") ? extractS3Key(path) : path;
        s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});
      }
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/music-albums/reorder — ordina album musicali
// ---------------------------------------------------------------------------
router.patch("/admin/music-albums/reorder", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body as { items: Array<{ publicId: string; ordine: number }> };
    if (!Array.isArray(items)) return next(createHttpError(400, "items deve essere un array"));

    const pool = getPool();
    for (const item of items) {
      await pool.execute("UPDATE album_musicali SET ordine=? WHERE publicId=?", [item.ordine, item.publicId]);
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
