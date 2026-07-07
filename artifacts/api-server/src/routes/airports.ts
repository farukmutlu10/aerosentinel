import { Router } from "express";
import { db, alertsTable, watchlistTable } from "@workspace/db";
import { count, max, eq } from "drizzle-orm";
import { getAirports, getMonitorState, getCurrentTaf, getCurrentMetar, getAllWeather, fetchWeatherForIcao } from "../lib/monitor.js";
import { getDeviceId, devOnly } from "../lib/reqContext.js";
import { getRunways } from "../lib/runways.js";

const router = Router();

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
  if (!icao || !/^[A-Z]{4}$/.test(icao)) {
    return res.status(400).json({ error: "Invalid ICAO code" });
  }
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
  if (!icao || !/^[A-Z]{4}$/.test(icao)) {
    return res.status(400).json({ error: "Invalid ICAO code" });
  }
  if (getAirports().includes(icao)) {
    const rawMetar = await getCurrentMetar(icao);
    if (!rawMetar) return res.status(404).json({ error: "No METAR data yet" });
    return res.json({ icao, rawMetar });
  }
  const { rawMetar } = await fetchWeatherForIcao(icao);
  if (!rawMetar) return res.status(404).json({ error: "No METAR data available" });
  return res.json({ icao, rawMetar });
});

// Batch lookup — a large watchlist must be a single request, not one per ICAO.
// The per-ICAO route below used to be called once per airport by the Dashboard
// prefetch; with a 210-airport watchlist that alone blew through the whole
// 200 req/min rate-limit window and 429'd the alerts/sync polling for the rest
// of the minute. Runway data is a static dataset, so it's also long-cacheable.
// NOTE: registered before /airports/:icao/runways cannot shadow it because the
// path segment "runways" here is literal ("/airports/runways").
router.get("/airports/runways", (req, res) => {
  const raw = ((req.query.icaos as string) ?? "").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  if (raw.length === 0) {
    return res.status(400).json({ error: "icaos query param required (comma-separated)" });
  }
  const icaos = [...new Set(raw.filter((s) => /^[A-Z0-9]{3,5}$/.test(s)))].slice(0, 300);
  const runways: Record<string, unknown> = {};
  for (const icao of icaos) {
    runways[icao] = getRunways(icao);
  }
  res.set("Cache-Control", "public, max-age=86400");
  return res.json({ runways });
});

router.get("/airports/:icao/runways", (req, res) => {
  const icao = req.params.icao?.toUpperCase();
  if (!icao || !/^[A-Z0-9]{3,5}$/.test(icao)) {
    return res.status(400).json({ error: "Invalid ICAO code" });
  }
  res.set("Cache-Control", "public, max-age=86400");
  return res.json({ icao, runways: getRunways(icao) });
});

router.get("/monitor/status", (_req, res) => {
  const state = getMonitorState();
  return res.json(state);
});

router.get("/monitor/diag", devOnly, async (req, res) => {
  const icaos = ((req.query.icaos as string) ?? "UAUU,ULLI").split(",").map(s => s.trim().toUpperCase());
  const allAirports = getAirports();
  const results: Record<string, unknown> = {};
  for (const icao of icaos) {
    const inWatchlist = allAirports.includes(icao);
    const rawMetar = await getCurrentMetar(icao);
    const rawTaf = await getCurrentTaf(icao);
    results[icao] = {
      inWatchlist,
      rawMetar: rawMetar ?? null,
      rawTaf: rawTaf ?? null,
      metarStartsWithSpeci: rawMetar?.startsWith("SPECI") ?? false,
    };
  }
  return res.json({
    totalAirports: allAirports.length,
    sampleIcaos: allAirports.slice(0, 10),
    diagFor: results,
  });
});

export default router;
