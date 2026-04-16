import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../db/pool";
import { authMiddleware } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { createHttpError } from "../middleware/error-handler";
import { EventDate } from "../types";

const router = Router();
const adminOnly = [authMiddleware, requireAdmin];

function normalizeOra(ora: unknown): string | null {
  if (!ora) return null;
  const str = String(ora);
  // MySQL TIME restituisce 'HH:MM:SS' — tronca a 'HH:MM'
  return str.length >= 5 ? str.slice(0, 5) : str;
}

async function fetchDatesForEvents(eventoIds: number[]): Promise<Map<number, EventDate[]>> {
  if (!eventoIds.length) return new Map();
  const pool = getPool();
  const placeholders = eventoIds.map(() => "?").join(", ");
  const [rows] = await pool.execute(
    `SELECT id, eventoId, DATE_FORMAT(data, '%Y-%m-%d') AS data, ora
     FROM event_dates WHERE eventoId IN (${placeholders})
     ORDER BY data ASC, ora ASC`,
    eventoIds
  ) as [any[], any];

  const map = new Map<number, EventDate[]>();
  for (const row of rows) {
    const list = map.get(row.eventoId) ?? [];
    list.push({ id: row.id, eventoId: row.eventoId, data: row.data, ora: normalizeOra(row.ora) });
    map.set(row.eventoId, list);
  }
  return map;
}

async function insertDates(eventoId: number, dates: EventDate[]): Promise<void> {
  if (!dates.length) return;
  const pool = getPool();
  for (const d of dates) {
    await pool.execute(
      "INSERT INTO event_dates (eventoId, data, ora) VALUES (?, ?, ?)",
      [eventoId, d.data, d.ora ?? null]
    );
  }
}

// ---------------------------------------------------------------------------
// GET /events — lista pubblica (tutti gli eventi con le loro date)
// ---------------------------------------------------------------------------
router.get("/events", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM eventi ORDER BY createdAt DESC"
    ) as [any[], any];

    const ids = rows.map((r: any) => r.id);
    const datesMap = await fetchDatesForEvents(ids);

    res.json(rows.map((r: any) => ({ ...r, dates: datesMap.get(r.id) ?? [] })));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /events/:publicId — dettaglio pubblico singolo evento
// ---------------------------------------------------------------------------
router.get("/events/:publicId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM eventi WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!rows.length) return next(createHttpError(404, "Evento non trovato"));

    const evento = rows[0];
    const datesMap = await fetchDatesForEvents([evento.id]);
    res.json({ ...evento, dates: datesMap.get(evento.id) ?? [] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/events — lista admin
// ---------------------------------------------------------------------------
router.get("/admin/events", adminOnly, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM eventi ORDER BY createdAt DESC"
    ) as [any[], any];

    const ids = rows.map((r: any) => r.id);
    const datesMap = await fetchDatesForEvents(ids);

    res.json(rows.map((r: any) => ({ ...r, dates: datesMap.get(r.id) ?? [] })));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/events/:publicId — dettaglio admin
// ---------------------------------------------------------------------------
router.get("/admin/events/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM eventi WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!rows.length) return next(createHttpError(404, "Evento non trovato"));

    const evento = rows[0];
    const datesMap = await fetchDatesForEvents([evento.id]);
    res.json({ ...evento, dates: datesMap.get(evento.id) ?? [] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/events — crea evento
// ---------------------------------------------------------------------------
router.post("/admin/events", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { titolo, immagineS3Path, descrizioneIT, descrizioneEN, linkBiglietti, dates = [] } = req.body;

    if (!titolo) return next(createHttpError(400, "titolo è obbligatorio"));
    if (!dates.length) return next(createHttpError(400, "Almeno una data è obbligatoria"));

    const publicId = randomUUID();
    const pool = getPool();

    const [result] = await pool.execute(
      `INSERT INTO eventi (publicId, titolo, immagineS3Path, descrizioneIT, descrizioneEN, linkBiglietti)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [publicId, titolo, immagineS3Path ?? null, descrizioneIT ?? null, descrizioneEN ?? null, linkBiglietti ?? null]
    ) as [any, any];

    await insertDates(result.insertId, dates);

    const [rows] = await pool.execute(
      "SELECT * FROM eventi WHERE id = ?",
      [result.insertId]
    ) as [any[], any];

    const datesMap = await fetchDatesForEvents([result.insertId]);
    res.status(201).json({ ...rows[0], dates: datesMap.get(result.insertId) ?? [] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/events/:publicId — aggiorna evento (rimpiazza anche le date)
// ---------------------------------------------------------------------------
router.put("/admin/events/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { titolo, immagineS3Path, descrizioneIT, descrizioneEN, linkBiglietti, dates = [] } = req.body;

    if (!titolo) return next(createHttpError(400, "titolo è obbligatorio"));
    if (!dates.length) return next(createHttpError(400, "Almeno una data è obbligatoria"));

    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id FROM eventi WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Evento non trovato"));
    const eventoId = existing[0].id;

    await pool.execute(
      `UPDATE eventi SET titolo=?, immagineS3Path=?, descrizioneIT=?, descrizioneEN=?, linkBiglietti=?
       WHERE id=?`,
      [titolo, immagineS3Path ?? null, descrizioneIT ?? null, descrizioneEN ?? null, linkBiglietti ?? null, eventoId]
    );

    await pool.execute("DELETE FROM event_dates WHERE eventoId = ?", [eventoId]);
    await insertDates(eventoId, dates);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/events/:publicId — elimina evento (cascade sulle date)
// ---------------------------------------------------------------------------
router.delete("/admin/events/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT id FROM eventi WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];

    if (!existing.length) return next(createHttpError(404, "Evento non trovato"));

    await pool.execute("DELETE FROM eventi WHERE id = ?", [existing[0].id]);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
