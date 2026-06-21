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

// Security headers (helmet)
if (process.env.NODE_ENV === "production") {
  app.use(helmet());
}

// Compression (gzip)
app.use(compression());

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

// CORS — production'da domain'e göre kısıtla
const allowedOrigins = process.env.NODE_ENV === "production"
  ? ["https://aerosentinel.app", "https://www.aerosentinel.app"]
  : ["http://localhost:3000", "http://localhost:5001"];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

app.use("/api", router);

runMigrations().catch((err) => logger.error({ err }, "Migration failed"));

startMonitor();

export default app;
