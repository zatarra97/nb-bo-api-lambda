import { Router, Request, Response, NextFunction } from "express";
import { randomUUID, randomBytes } from "crypto";
import * as React from "react";
import { getPool } from "../db/pool";
import { createHttpError } from "../middleware/error-handler";
import { sendEmail } from "../../emails/send";
import { ConfermaIscrizioneEmail } from "../../emails/templates/conferma-iscrizione";

const router = Router();

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

export default router;
