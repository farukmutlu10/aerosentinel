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
import { configureVapid } from "./lib/push.js";

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
      "https://*.aerosentinel.pages.dev",
    ]
  : [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:5001",
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Origin may be undefined for non-browser requests (curl, healthchecks, server-to-server)
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some((o) => {
      if (o.startsWith("https://*.")) {
        const suffix = o.slice("https://*.".length); // "aerosentinel.pages.dev"
        return origin === `https://${suffix}` || origin.endsWith(`.${suffix}`);
      }
      return origin === o;
    });
    callback(null, isAllowed);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Device-ID"],
}));

// Security headers (helmet) — CORS'tan SONRA, crossOriginResourcePolicy kapalı
if (process.env.NODE_ENV === "production") {
  app.use(helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://www.googletagmanager.com",
          "https://pagead2.googlesyndication.com",
          "https://www.google-analytics.com",
        ],
        connectSrc: [
          "'self'",
          "https://www.google-analytics.com",
          "https://pagead2.googlesyndication.com",
        ],
        frameSrc: ["'self'", "https://googleads.g.doubleclick.net"],
        imgSrc: ["'self'", "data:", "https:"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
  }));
}

// Rate limiting — 200 requests/min per IP
const limiter = rateLimit({
  windowMs: 60_000,
  max: 200,
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

// Configure VAPID keys for web push notifications
configureVapid();

// Migration'ları çalıştır, BİTTİKTEN SONRA monitor'u başlat.
// Aksi halde tablolar oluşmadan monitor sorgu atıp "relation does not exist" (42P01) hatası verir.
logger.info("[startup] Running migrations...");
runMigrations()
  .then(() => {
    logger.info("[startup] Migrations complete — starting monitor");
    startMonitor();
  })
  .catch((err) => {
    logger.error({ err }, "[startup] Migration failed — starting monitor anyway (in-memory fallback)");
    startMonitor();
  });

export default app;
