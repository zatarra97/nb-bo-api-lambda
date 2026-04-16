import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { getPool } from "../db/pool";
import { authMiddleware } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { createHttpError } from "../middleware/error-handler";

const router = Router();
const adminOnly = [authMiddleware, requireAdmin];

// ---------------------------------------------------------------------------
// GET /content-blocks?sezione=about-me — lista pubblica per sezione
// ---------------------------------------------------------------------------
router.get("/content-blocks", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const { sezione } = req.query;
    let sql = "SELECT * FROM content_blocks";
    const params: any[] = [];
    if (sezione) {
      sql += " WHERE sezione = ?";
      params.push(sezione);
    }
    sql += " ORDER BY ordine ASC, createdAt ASC";
    const [rows] = await pool.execute(sql, params) as [any[], any];
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/content-blocks — lista admin
// ---------------------------------------------------------------------------
router.get("/admin/content-blocks", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const { sezione } = req.query;
    let sql = "SELECT * FROM content_blocks";
    const params: any[] = [];
    if (sezione) {
      sql += " WHERE sezione = ?";
      params.push(sezione);
    }
    sql += " ORDER BY sezione ASC, ordine ASC, createdAt ASC";
    const [rows] = await pool.execute(sql, params) as [any[], any];
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/content-blocks/:publicId — dettaglio admin
// ---------------------------------------------------------------------------
router.get("/admin/content-blocks/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT * FROM content_blocks WHERE publicId = ?",
      [req.params.publicId]
    ) as [any[], any];
    if (!rows.length) return next(createHttpError(404, "Blocco non trovato"));
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/content-blocks — crea blocco
// ---------------------------------------------------------------------------
router.post("/admin/content-blocks", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sezione, titoloIT, titoloEN, contenutoIT, contenutoEN, ordine } = req.body;
    if (!sezione?.trim()) return next(createHttpError(400, "sezione è obbligatoria"));

    const pool = getPool();
    const publicId = randomUUID();
    await pool.execute(
      `INSERT INTO content_blocks (publicId, sezione, titoloIT, titoloEN, contenutoIT, contenutoEN, ordine)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [publicId, sezione.trim(), titoloIT || null, titoloEN || null, contenutoIT || null, contenutoEN || null, ordine ?? 0]
    );
    const [rows] = await pool.execute("SELECT * FROM content_blocks WHERE publicId = ?", [publicId]) as [any[], any];
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// PUT /admin/content-blocks/:publicId — aggiorna blocco
// ---------------------------------------------------------------------------
router.put("/admin/content-blocks/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sezione, titoloIT, titoloEN, contenutoIT, contenutoEN, ordine } = req.body;
    if (!sezione?.trim()) return next(createHttpError(400, "sezione è obbligatoria"));

    const pool = getPool();
    const [result] = await pool.execute(
      `UPDATE content_blocks SET sezione=?, titoloIT=?, titoloEN=?, contenutoIT=?, contenutoEN=?, ordine=?
       WHERE publicId = ?`,
      [sezione.trim(), titoloIT || null, titoloEN || null, contenutoIT || null, contenutoEN || null, ordine ?? 0, req.params.publicId]
    ) as [any, any];
    if (result.affectedRows === 0) return next(createHttpError(404, "Blocco non trovato"));
    const [rows] = await pool.execute("SELECT * FROM content_blocks WHERE publicId = ?", [req.params.publicId]) as [any[], any];
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/content-blocks/:publicId — elimina blocco
// ---------------------------------------------------------------------------
router.delete("/admin/content-blocks/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [result] = await pool.execute(
      "DELETE FROM content_blocks WHERE publicId = ?",
      [req.params.publicId]
    ) as [any, any];
    if (result.affectedRows === 0) return next(createHttpError(404, "Blocco non trovato"));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
