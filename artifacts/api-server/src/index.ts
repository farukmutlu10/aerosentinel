import app from "./app";
import { logger } from "./lib/logger";

// ── Global error handlers — prevent container restart on unhandled errors ──
process.on("unhandledRejection", (reason, promise) => {
  logger.error({ reason, promise }, "[process] Unhandled promise rejection — NOT crashing");
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "[process] Uncaught exception — NOT crashing");
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  logger.error(
    "[startup] Available env var names: " +
    Object.keys(process.env).filter(k => !k.includes("SECRET") && !k.includes("KEY") && !k.includes("PASS") && !k.includes("TOKEN")).join(", ")
  );
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
