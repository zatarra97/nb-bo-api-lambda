import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../db/pool";
import { authMiddleware } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { createHttpError } from "../middleware/error-handler";

const router = Router();
const adminOnly = [authMiddleware, requireAdmin];

// ---------------------------------------------------------------------------
// GET /press — lista pubblica ordinata
// ---------------------------------------------------------------------------
router.get("/press", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM press ORDER BY ordine ASC, createdAt ASC"
    ) as [any[], any];
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/press — lista admin
// ---------------------------------------------------------------------------
router.get("/admin/press", adminOnly, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM press ORDER BY ordine ASC, createdAt ASC"
    ) as [any[], any];
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/press/:publicId — dettaglio admin
// ---------------------------------------------------------------------------
router.get("/admin/press/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM press WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!rows.length) return next(createHttpError(404, "Articolo press non trovato"));
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/press — crea articolo press
// Se `ordine` non è fornito, lo assegna automaticamente come MAX(ordine)+1
// (nuovo elemento in coda). Il drag & drop lato admin gestisce poi i riordini.
// ---------------------------------------------------------------------------
router.post("/admin/press", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nomeTestata, citazioneIT, citazioneEN, nomeGiornalista, ordine } = req.body;

    if (!nomeTestata) return next(createHttpError(400, "nomeTestata è obbligatorio"));

    const publicId = randomUUID();
    const pool = getPool();

    let ordineValue = ordine;
    if (ordineValue === undefined || ordineValue === null) {
      const [[{ next: nextOrdine }]] = await pool.execute(
        "SELECT COALESCE(MAX(ordine), 0) + 1 AS `next` FROM press"
      ) as [any[], any];
      ordineValue = nextOrdine;
    }

    const [result] = await pool.execute(
      `INSERT INTO press (publicId, nomeTestata, citazioneIT, citazioneEN, nomeGiornalista, ordine)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [publicId, nomeTestata, citazioneIT ?? null, citazioneEN ?? null, nomeGiornalista ?? null, ordineValue]
    ) as [any, any];

    const [rows] = await pool.execute("SELECT * FROM press WHERE id = ?", [result.insertId]) as [any[], any];
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/press/:publicId — aggiorna articolo press
// `ordine` se omesso viene preservato (riordino gestito da PATCH /reorder).
// ---------------------------------------------------------------------------
router.put("/admin/press/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { nomeTestata, citazioneIT, citazioneEN, nomeGiornalista, ordine } = req.body;

    if (!nomeTestata) return next(createHttpError(400, "nomeTestata è obbligatorio"));

    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id FROM press WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Articolo press non trovato"));

    // COALESCE preserva il valore esistente se `ordine` non è nel payload.
    const ordineParam = ordine === undefined || ordine === null ? null : ordine;

    await pool.execute(
      `UPDATE press SET nomeTestata=?, citazioneIT=?, citazioneEN=?, nomeGiornalista=?,
       ordine = COALESCE(?, ordine) WHERE id=?`,
      [nomeTestata, citazioneIT ?? null, citazioneEN ?? null, nomeGiornalista ?? null, ordineParam, existing[0].id]
    );

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/press/:publicId — elimina articolo press
// ---------------------------------------------------------------------------
router.delete("/admin/press/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id FROM press WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Articolo press non trovato"));

    await pool.execute("DELETE FROM press WHERE id = ?", [existing[0].id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PATCH /admin/press/reorder — aggiorna ordine bulk
// ---------------------------------------------------------------------------
router.patch("/admin/press/reorder", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { items } = req.body as { items: Array<{ publicId: string; ordine: number }> };

    if (!Array.isArray(items)) return next(createHttpError(400, "items deve essere un array"));

    const pool = getPool();
    for (const item of items) {
      await pool.execute("UPDATE press SET ordine=? WHERE publicId=?", [item.ordine, item.publicId]);
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
