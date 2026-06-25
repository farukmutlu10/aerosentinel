import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import router from "./routes";
import { logger } from "./lib/logger";
import { startMonitor } from "./lib/monitor.js";
import { runMigrations } from "./lib/migrate.js";

const app: Express = express();

// ── Security & production middleware ──────────────────────────

// Compression (gzip)
app.use(compression());

// CORS — HELMET'ten ÖNCE gelmeli, yoksa helmet CORS header'larını siler
const allowedOrigins = process.env.NODE_ENV === "production"
  ? [
      "https://aerosentinel.app",
      "https://www.aerosentinel.app",
      "https://aerosentinel.pages.dev",
      "https://preview.aerosentinel.pages.dev",
      "https://production.aerosentinel.pages.dev",
    ]
  : ["http://localhost:3000", "http://localhost:5001"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.some(o => o.endsWith(".*") ? origin.startsWith(o.replace(".*", "")) : o === origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Hata fırlatma, herkese izin ver (debug için)
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Device-ID"],
}));

// Security headers (helmet) — CORS'tan SONRA, crossOriginResourcePolicy kapalı
if (process.env.NODE_ENV === "production") {
  app.use(helmet({
    crossOriginResourcePolicy: false,
  }));
}

// Rate limiting — 100 requests/min per IP
const limiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});
app.use("/api", limiter);

// Logging
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", router);

// Migration'ları çalıştır, BİTTİKTEN SONRA monitor'u başlat.
// Aksi halde tablolar oluşmadan monitor sorgu atıp "relation does not exist" (42P01) hatası verir.
runMigrations()
  .then(() => {
    logger.info("Migrations complete — starting monitor");
    startMonitor();
  })
  .catch((err) => {
    logger.error({ err }, "Migration failed — starting monitor anyway (in-memory fallback)");
    startMonitor();
  });

export default app;
