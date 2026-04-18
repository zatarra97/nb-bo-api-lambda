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

function extractS3Key(url: string): string {
  const PUBLIC_URL_BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`;
  return url.startsWith(PUBLIC_URL_BASE) ? url.slice(PUBLIC_URL_BASE.length) : url;
}

// ---------------------------------------------------------------------------
// GET /public-download-images — lista pubblica
// (path prefissato "public-" perché è l'unica rotta pubblica di questa entità;
// non vogliamo che conflitti o possa essere confusa con "/admin/download-images")
// ---------------------------------------------------------------------------
router.get("/public-download-images", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM immagini_download ORDER BY ordine ASC, createdAt DESC"
    ) as [any[], any];
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/download-images — lista admin
// ---------------------------------------------------------------------------
router.get("/admin/download-images", adminOnly, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM immagini_download ORDER BY ordine ASC, createdAt DESC"
    ) as [any[], any];
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/download-images/:publicId — dettaglio admin
// ---------------------------------------------------------------------------
router.get("/admin/download-images/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM immagini_download WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!rows.length) return next(createHttpError(404, "Immagine non trovata"));
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/download-images — crea immagine scaricabile
// `ordine` se omesso → MAX(ordine)+1 (in coda)
// ---------------------------------------------------------------------------
router.post("/admin/download-images", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { titolo, s3Path, anno, credit, risoluzione, ordine } = req.body;

    if (!titolo) return next(createHttpError(400, "titolo è obbligatorio"));

    const publicId = randomUUID();
    const pool = getPool();

    let ordineValue = ordine;
    if (ordineValue === undefined || ordineValue === null) {
      const [[{ next: nextOrdine }]] = await pool.execute(
        "SELECT COALESCE(MAX(ordine), 0) + 1 AS `next` FROM immagini_download"
      ) as [any[], any];
      ordineValue = nextOrdine;
    }

    const [result] = await pool.execute(
      `INSERT INTO immagini_download (publicId, titolo, s3Path, anno, credit, risoluzione, ordine)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        publicId, titolo,
        s3Path ?? null,
        anno ?? null,
        credit ?? null,
        risoluzione ?? null,
        ordineValue,
      ]
    ) as [any, any];

    const [rows] = await pool.execute(
      "SELECT * FROM immagini_download WHERE id = ?",
      [result.insertId]
    ) as [any[], any];
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/download-images/:publicId — aggiorna
// `ordine` omesso → preservato (riordino via PATCH /reorder)
// ---------------------------------------------------------------------------
router.put("/admin/download-images/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { titolo, s3Path, anno, credit, risoluzione, ordine } = req.body;

    if (!titolo) return next(createHttpError(400, "titolo è obbligatorio"));

    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id FROM immagini_download WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Immagine non trovata"));

    const ordineParam = ordine === undefined || ordine === null ? null : ordine;

    await pool.execute(
      `UPDATE immagini_download SET titolo=?, s3Path=?, anno=?, credit=?, risoluzione=?,
       ordine = COALESCE(?, ordine) WHERE id=?`,
      [
        titolo,
        s3Path ?? null,
        anno ?? null,
        credit ?? null,
        risoluzione ?? null,
        ordineParam,
        existing[0].id,
      ]
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/download-images/:publicId — elimina immagine (+ file S3)
// ---------------------------------------------------------------------------
router.delete("/admin/download-images/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id, s3Path FROM immagini_download WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Immagine non trovata"));

    await pool.execute("DELETE FROM immagini_download WHERE id = ?", [existing[0].id]);

    if (existing[0].s3Path) {
      const key = existing[0].s3Path.startsWith("http")
        ? extractS3Key(existing[0].s3Path)
        : existing[0].s3Path;
      s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/download-images/reorder — ordina
// Body: { items: [{ publicId, ordine }] }
// ---------------------------------------------------------------------------
router.patch("/admin/download-images/reorder", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body as { items: Array<{ publicId: string; ordine: number }> };
    if (!Array.isArray(items)) return next(createHttpError(400, "items deve essere un array"));

    const pool = getPool();
    for (const item of items) {
      await pool.execute(
        "UPDATE immagini_download SET ordine=? WHERE publicId=?",
        [item.ordine, item.publicId]
      );
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
