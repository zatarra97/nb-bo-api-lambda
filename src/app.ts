import express from "express";
import cors from "cors";
import { errorHandler } from "./middleware/error-handler";
import healthRoutes from "./routes/health.routes";
import eventsRoutes from "./routes/events.routes";
import pressRoutes from "./routes/press.routes";
import photoAlbumsRoutes from "./routes/photo-albums.routes";
import musicAlbumsRoutes from "./routes/music-albums.routes";
import mediaRoutes from "./routes/media.routes";
import contentBlocksRoutes from "./routes/content-blocks.routes";
import subscribersRoutes from "./routes/subscribers.routes";

export const app = express();

app.use(
  cors({
    origin: (origin, callback) => {
      const allowed = (process.env.CORS_FRONTEND || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin not allowed — ${origin}`));
      }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

// Auth applicata per-route (adminOnly nei singoli router)
app.use(healthRoutes);
app.use(eventsRoutes);
app.use(pressRoutes);
app.use(photoAlbumsRoutes);
app.use(musicAlbumsRoutes);
app.use(mediaRoutes);
app.use(contentBlocksRoutes);
app.use(subscribersRoutes);

app.use(errorHandler);
