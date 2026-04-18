import { Router, Request, Response, NextFunction } from "express";
import { randomUUID, randomBytes } from "crypto";
import * as React from "react";
import { getPool } from "../db/pool";
import { createHttpError } from "../middleware/error-handler";
import { authMiddleware } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { sendEmail } from "../../emails/send";
import { ConfermaIscrizioneEmail } from "../../emails/templates/conferma-iscrizione";
import { NewsletterEmail } from "../../emails/templates/newsletter";

const router = Router();
const adminOnly = [authMiddleware, requireAdmin];

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5175";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// POST /subscribe — iscrizione con invio email di conferma
// ---------------------------------------------------------------------------
router.post("/subscribe", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") return next(createHttpError(400, "Email obbligatoria"));

    const emailNorm = email.trim().toLowerCase();
    if (!EMAIL_RE.test(emailNorm)) return next(createHttpError(400, "Email non valida"));

    const pool = getPool();
    const [existing] = await pool.execute(
      "SELECT token, confermato FROM subscribers WHERE email = ?",
      [emailNorm]
    ) as [any[], any];

    let token: string;

    if (existing.length > 0) {
      if (existing[0].confermato) {
        // Già confermato — risposta silenziosa per non rivelare se l'email è iscritta
        res.json({ success: true });
        return;
      }
      token = existing[0].token;
    } else {
      token = randomBytes(32).toString("hex");
      await pool.execute(
        "INSERT INTO subscribers (publicId, email, token) VALUES (?, ?, ?)",
        [randomUUID(), emailNorm, token]
      );
    }

    const confirmUrl = `${FRONTEND_URL}/newsletter/conferma?token=${token}`;
    const unsubscribeUrl = `${FRONTEND_URL}/newsletter/disiscrizione?token=${token}`;

    await sendEmail({
      to: emailNorm,
      subject: "Conferma la tua iscrizione",
      template: React.createElement(ConfermaIscrizioneEmail, { confirmUrl, unsubscribeUrl }),
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /confirm?token=xxx — conferma iscrizione
// ---------------------------------------------------------------------------
router.get("/confirm", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") return next(createHttpError(400, "Token mancante"));

    const pool = getPool();
    const [check] = await pool.execute(
      "SELECT publicId, confermato FROM subscribers WHERE token = ?",
      [token]
    ) as [any[], any];

    if (!check.length) return next(createHttpError(404, "Token non valido"));

    if (!check[0].confermato) {
      await pool.execute(
        "UPDATE subscribers SET confermato = 1 WHERE token = ?",
        [token]
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /unsubscribe?token=xxx — disiscrizione
// ---------------------------------------------------------------------------
router.delete("/unsubscribe", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.query;
    if (!token || typeof token !== "string") return next(createHttpError(400, "Token mancante"));

    const pool = getPool();
    const [result] = await pool.execute(
      "DELETE FROM subscribers WHERE token = ?",
      [token]
    ) as [any, any];

    if (result.affectedRows === 0) return next(createHttpError(404, "Token non valido"));

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/subscribers — lista iscritti
// ---------------------------------------------------------------------------
router.get("/admin/subscribers", adminOnly, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT publicId, email, confermato, createdAt FROM subscribers ORDER BY createdAt DESC"
    ) as [any[], any];
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// DELETE /admin/subscribers/:publicId — elimina iscritto
// ---------------------------------------------------------------------------
router.delete("/admin/subscribers/:publicId", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [result] = await pool.execute(
      "DELETE FROM subscribers WHERE publicId = ?",
      [req.params.publicId]
    ) as [any, any];
    if (result.affectedRows === 0) return next(createHttpError(404, "Iscritto non trovato"));
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /admin/newsletter/invii — storico comunicazioni inviate
// ---------------------------------------------------------------------------
router.get("/admin/newsletter/invii", adminOnly, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT publicId, titolo, corpo, sentCount, inviatoAt FROM newsletter_invii ORDER BY inviatoAt DESC"
    ) as [any[], any];
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /admin/newsletter/send — invia email a tutti gli iscritti confermati
// ---------------------------------------------------------------------------
router.post("/admin/newsletter/send", adminOnly, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { titolo, corpo } = req.body;
    if (!titolo) return next(createHttpError(400, "titolo è obbligatorio"));
    if (!corpo) return next(createHttpError(400, "corpo è obbligatorio"));

    const pool = getPool();
    const [subscribers] = await pool.execute(
      "SELECT email, token FROM subscribers WHERE confermato = 1"
    ) as [any[], any];
    if (!(subscribers as any[]).length) return next(createHttpError(400, "Nessun iscritto confermato"));

    const contenutoHtml = (corpo as string)
      .split("\n\n")
      .map((p: string) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
      .join("");

    for (const sub of subscribers as any[]) {
      const unsubscribeUrl = `${FRONTEND_URL}/newsletter/disiscrizione?token=${sub.token}`;
      await sendEmail({
        to: sub.email,
        subject: titolo,
        template: React.createElement(NewsletterEmail, {
          titolo,
          contenutoHtml,
          unsubscribeUrl,
        }),
      });
    }

    const sentCount = (subscribers as any[]).length;
    const [result] = await pool.execute(
      "INSERT INTO newsletter_invii (publicId, titolo, corpo, sentCount) VALUES (?, ?, ?, ?)",
      [randomUUID(), titolo, corpo, sentCount]
    ) as [any, any];

    const [rows] = await pool.execute(
      "SELECT publicId, titolo, corpo, sentCount, inviatoAt FROM newsletter_invii WHERE id = ?",
      [result.insertId]
    ) as [any[], any];

    res.json({ sentCount, invio: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
