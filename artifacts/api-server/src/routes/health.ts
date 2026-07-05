import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getMonitorState, getAirports, getCurrentTaf, getCurrentMetar } from "../lib/monitor.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// ── Diagnostic endpoint: monitor state + cache info ──
router.get("/monitor/debug", async (_req, res) => {
  const state = getMonitorState();
  const airports = getAirports();
  
  const sampleAirports = airports.slice(0, 10);
  const cacheStatus: Record<string, { hasTaf: boolean; hasMetar: boolean; tafPreview: string }> = {};
  for (const icao of sampleAirports) {
    const taf = await getCurrentTaf(icao);
    const metar = await getCurrentMetar(icao);
    cacheStatus[icao] = {
      hasTaf: !!taf,
      hasMetar: !!metar,
      tafPreview: taf ? taf.slice(0, 100) : "(empty)",
    };
  }

  res.json({
    monitor: state,
    airportsCount: airports.length,
    sampleAirports: cacheStatus,
    timestamp: new Date().toISOString(),
  });
});

export default router;
