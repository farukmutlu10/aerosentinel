import { Router } from "express";
import { db, alertsTable, watchlistTable } from "@workspace/db";
import { count, max, eq } from "drizzle-orm";
import { getAirports, getMonitorState, getCurrentTaf, getCurrentMetar, getAllWeather, fetchWeatherForIcao } from "../lib/monitor.js";

const router = Router();

function getDeviceId(req: Express.Request): string {
  return (req.headers["x-device-id"] as string) ?? "legacy";
}

router.get("/airports", async (req, res) => {
  const userId = getDeviceId(req);
  const airports = getAirports();
  const alertCounts = await db
    .select({
      icao: alertsTable.icao,
      alertCount: count(),
      lastAlert: max(alertsTable.detectedAt),
    })
    .from(alertsTable)
    .groupBy(alertsTable.icao);

  const countMap = new Map(alertCounts.map((r) => [r.icao, r]));

  const result = airports.map((icao) => {
    const row = countMap.get(icao);
    const alertCount = row ? Number(row.alertCount) : 0;
    const lastAlert = row?.lastAlert ?? null;
    let status: "normal" | "warning" | "critical" = "normal";
    if (alertCount >= 3) status = "critical";
    else if (alertCount >= 1) status = "warning";
    return { icao, alertCount, lastAlert, status };
  });

  return res.json(result);
});

router.get("/airports/weather", (_req, res) => {
  return res.json(getAllWeather());
});

router.get("/airports/:icao/taf", async (req, res) => {
  const icao = req.params.icao?.toUpperCase();
  if (getAirports().includes(icao)) {
    const rawTaf = await getCurrentTaf(icao);
    if (!rawTaf) return res.status(404).json({ error: "No TAF data yet" });
    return res.json({ icao, rawTaf });
  }
  const { rawTaf } = await fetchWeatherForIcao(icao);
  if (!rawTaf) return res.status(404).json({ error: "No TAF data available" });
  return res.json({ icao, rawTaf });
});

router.get("/airports/:icao/metar", async (req, res) => {
  const icao = req.params.icao?.toUpperCase();
  if (getAirports().includes(icao)) {
    const rawMetar = await getCurrentMetar(icao);
    if (!rawMetar) return res.status(404).json({ error: "No METAR data yet" });
    return res.json({ icao, rawMetar });
  }
  const { rawMetar } = await fetchWeatherForIcao(icao);
  if (!rawMetar) return res.status(404).json({ error: "No METAR data available" });
  return res.json({ icao, rawMetar });
});

router.get("/monitor/status", (_req, res) => {
  const state = getMonitorState();
  return res.json(state);
});

export default router;
