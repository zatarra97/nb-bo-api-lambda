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

async function fetchImagesForAlbums(albumIds: number[]): Promise<Map<number, any[]>> {
  if (!albumIds.length) return new Map();
  const pool = getPool();
  const placeholders = albumIds.map(() => "?").join(", ");
  const [rows] = await pool.execute(
    `SELECT * FROM immagini WHERE albumId IN (${placeholders}) ORDER BY ordine ASC`,
    albumIds
  ) as [any[], any];

  const map = new Map<number, any[]>();
  for (const row of rows) {
    const list = map.get(row.albumId) ?? [];
    list.push(row);
    map.set(row.albumId, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// GET /photo-albums — lista pubblica con immagini nested
// ---------------------------------------------------------------------------
router.get("/photo-albums", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [albums] = await pool.execute(
      "SELECT * FROM album_fotografici ORDER BY ordine ASC"
    ) as [any[], any];

    const ids = albums.map((a: any) => a.id);
    const imagesMap = await fetchImagesForAlbums(ids);

    res.json(albums.map((a: any) => ({ ...a, immagini: imagesMap.get(a.id) ?? [] })));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /photo-albums/:publicId — dettaglio album pubblico con immagini
// ---------------------------------------------------------------------------
router.get("/photo-albums/:publicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM album_fotografici WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];
    if (!rows.length) throw createHttpError(404, "Album not found");
    const album = rows[0];
    const imagesMap = await fetchImagesForAlbums([album.id]);
    res.json({ ...album, immagini: imagesMap.get(album.id) ?? [] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/photo-albums — lista admin
// ---------------------------------------------------------------------------
router.get("/admin/photo-albums", adminOnly, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [albums] = await pool.execute(
      "SELECT * FROM album_fotografici ORDER BY ordine ASC"
    ) as [any[], any];

    const ids = albums.map((a: any) => a.id);
    const imagesMap = await fetchImagesForAlbums(ids);

    res.json(albums.map((a: any) => ({ ...a, immagini: imagesMap.get(a.id) ?? [] })));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/photo-albums/:publicId — dettaglio album con immagini
// ---------------------------------------------------------------------------
router.get("/admin/photo-albums/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [albums] = await pool.execute(
      "SELECT * FROM album_fotografici WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!albums.length) return next(createHttpError(404, "Album non trovato"));

    const album = albums[0];
    const imagesMap = await fetchImagesForAlbums([album.id]);
    res.json({ ...album, immagini: imagesMap.get(album.id) ?? [] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/photo-albums — crea album
// Se `ordine` non è fornito lo assegna come MAX(ordine)+1 (album in coda).
// ---------------------------------------------------------------------------
router.post("/admin/photo-albums", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nome, ordine } = req.body;
    if (!nome) return next(createHttpError(400, "nome è obbligatorio"));

    const publicId = randomUUID();
    const pool = getPool();

    let ordineValue = ordine;
    if (ordineValue === undefined || ordineValue === null) {
      const [[{ next: nextOrdine }]] = await pool.execute(
        "SELECT COALESCE(MAX(ordine), 0) + 1 AS `next` FROM album_fotografici"
      ) as [any[], any];
      ordineValue = nextOrdine;
    }

    const [result] = await pool.execute(
      "INSERT INTO album_fotografici (publicId, nome, ordine) VALUES (?, ?, ?)",
      [publicId, nome, ordineValue]
    ) as [any, any];

    const [rows] = await pool.execute(
      "SELECT * FROM album_fotografici WHERE id = ?",
      [result.insertId]
    ) as [any[], any];

    res.status(201).json({ ...rows[0], immagini: [] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/photo-albums/:publicId — aggiorna album
// `ordine` omesso → preservato (riordino via PATCH /reorder).
// ---------------------------------------------------------------------------
router.put("/admin/photo-albums/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nome, ordine } = req.body;
    if (!nome) return next(createHttpError(400, "nome è obbligatorio"));

    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id FROM album_fotografici WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Album non trovato"));

    const ordineParam = ordine === undefined || ordine === null ? null : ordine;

    await pool.execute(
      "UPDATE album_fotografici SET nome=?, ordine = COALESCE(?, ordine) WHERE id=?",
      [nome, ordineParam, existing[0].id]
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/photo-albums/:publicId — elimina album e tutte le immagini
// ---------------------------------------------------------------------------
router.delete("/admin/photo-albums/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id FROM album_fotografici WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Album non trovato"));

    const albumId = existing[0].id;

    // Recupera i path S3 delle immagini per cancellarle
    const [images] = await pool.execute(
      "SELECT s3Path FROM immagini WHERE albumId = ? AND s3Path IS NOT NULL",
      [albumId]
    ) as [any[], any];

    await pool.execute("DELETE FROM album_fotografici WHERE id = ?", [albumId]);

    // Cancella file S3 in background (non bloccante per la risposta)
    for (const img of images) {
      const key = img.s3Path.startsWith("http") ? extractS3Key(img.s3Path) : img.s3Path;
      s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key })).catch(() => {});
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/photo-albums/reorder — ordina album
// ---------------------------------------------------------------------------
router.patch("/admin/photo-albums/reorder", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body as { items: Array<{ publicId: string; ordine: number }> };
    if (!Array.isArray(items)) return next(createHttpError(400, "items deve essere un array"));

    const pool = getPool();
    for (const item of items) {
      await pool.execute("UPDATE album_fotografici SET ordine=? WHERE publicId=?", [item.ordine, item.publicId]);
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/photo-albums/:publicId/images — aggiunge immagine all'album
// Se `ordine` non è fornito viene calcolato come MAX(ordine)+1 fra le immagini
// dello stesso album: la nuova immagine finisce in coda alla galleria.
// ---------------------------------------------------------------------------
router.post("/admin/photo-albums/:publicId/images", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [albums] = await pool.execute(
      "SELECT id FROM album_fotografici WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!albums.length) return next(createHttpError(404, "Album non trovato"));
    const albumId = albums[0].id;

    const { ordine, s3Path, titolo, ruoloIT, ruoloEN, conIT, conEN, descrizioneIT, descrizioneEN } = req.body;

    let ordineValue = ordine;
    if (ordineValue === undefined || ordineValue === null) {
      const [[{ next: nextOrdine }]] = await pool.execute(
        "SELECT COALESCE(MAX(ordine), 0) + 1 AS `next` FROM immagini WHERE albumId = ?",
        [albumId]
      ) as [any[], any];
      ordineValue = nextOrdine;
    }

    const publicId = randomUUID();
    const [result] = await pool.execute(
      `INSERT INTO immagini (publicId, albumId, ordine, s3Path, titolo, ruoloIT, ruoloEN, conIT, conEN, descrizioneIT, descrizioneEN)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [publicId, albumId, ordineValue, s3Path ?? null, titolo ?? null, ruoloIT ?? null, ruoloEN ?? null,
       conIT ?? null, conEN ?? null, descrizioneIT ?? null, descrizioneEN ?? null]
    ) as [any, any];

    const [rows] = await pool.execute("SELECT * FROM immagini WHERE id = ?", [result.insertId]) as [any[], any];
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/photo-albums/:albumPublicId/images/:imagePublicId — aggiorna immagine
// `ordine` omesso → preservato (riordino via PATCH /images/reorder).
// ---------------------------------------------------------------------------
router.put("/admin/photo-albums/:albumPublicId/images/:imagePublicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id FROM immagini WHERE publicId = ?",
      [req.params.imagePublicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Immagine non trovata"));

    const { ordine, s3Path, titolo, ruoloIT, ruoloEN, conIT, conEN, descrizioneIT, descrizioneEN } = req.body;

    const ordineParam = ordine === undefined || ordine === null ? null : ordine;

    await pool.execute(
      `UPDATE immagini SET ordine = COALESCE(?, ordine), s3Path=?, titolo=?, ruoloIT=?, ruoloEN=?, conIT=?, conEN=?,
       descrizioneIT=?, descrizioneEN=? WHERE id=?`,
      [ordineParam, s3Path ?? null, titolo ?? null, ruoloIT ?? null, ruoloEN ?? null,
       conIT ?? null, conEN ?? null, descrizioneIT ?? null, descrizioneEN ?? null, existing[0].id]
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/photo-albums/:albumPublicId/images/:imagePublicId — elimina immagine
// ---------------------------------------------------------------------------
router.delete("/admin/photo-albums/:albumPublicId/images/:imagePublicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id, s3Path FROM immagini WHERE publicId = ?",
      [req.params.imagePublicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Immagine non trovata"));

    await pool.execute("DELETE FROM immagini WHERE id = ?", [existing[0].id]);

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
// PATCH /admin/photo-albums/:publicId/images/reorder — ordina immagini
// ---------------------------------------------------------------------------
router.patch("/admin/photo-albums/:publicId/images/reorder", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body as { items: Array<{ publicId: string; ordine: number }> };
    if (!Array.isArray(items)) return next(createHttpError(400, "items deve essere un array"));

    const pool = getPool();
    for (const item of items) {
      await pool.execute("UPDATE immagini SET ordine=? WHERE publicId=?", [item.ordine, item.publicId]);
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

function extractS3Key(url: string): string {
  const PUBLIC_URL_BASE = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`;
  return url.startsWith(PUBLIC_URL_BASE) ? url.slice(PUBLIC_URL_BASE.length) : url;
}

export default router;
