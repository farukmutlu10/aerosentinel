import { db, alertsTable, watchlistTable } from "@workspace/db";

let cachedIcaos: string[] = [];

const sonGorulenTaf:   Record<string, string> = {};
const sonGorulenMetar: Record<string, string> = {};
const sonGorulenTs:    Record<string, number> = {}; // last-scanned timestamp per ICAO

const WEATHER_CACHE_MAX_AGE = 90_000; // 90 s — monitor scans every 60 s

// Separate display cache for /watchlist/weather — NEVER touches change-detection state
const displayCache: Record<string, { rawTaf: string | null; rawMetar: string | null; ts: number }> = {};
const DISPLAY_CACHE_MAX_AGE = 60_000; // 60 s

let scanCount = 0;
let scanCountToday = 0;
let lastResetDateStr = getUtcDateStr();
let lastScan: Date | null = null;
let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const HEADERS = { "User-Agent": "Mozilla/5.0 AERO-SENTINEL/1.8" };
const BASE_URL = "https://aviationweather.gov/api/data";

function getUtcDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function checkDailyReset() {
  const today = getUtcDateStr();
  if (today !== lastResetDateStr) {
    scanCountToday = 0;
    lastResetDateStr = today;
  }
}

async function fetchJson(url: string): Promise<unknown[]> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return [];
  return (await res.json()) as unknown[];
}

async function refreshIcaoCache(): Promise<string[]> {
  const rows = await db.select({ icao: watchlistTable.icao }).from(watchlistTable);
  if (rows.length === 0) {
    await db.insert(watchlistTable).values({ icao: "LTFH" }).onConflictDoNothing();
    cachedIcaos = ["LTFH"];
  } else {
    cachedIcaos = rows.map((r) => r.icao);
  }
  return cachedIcaos;
}

async function seedIfEmpty() {
  const rows = await db.select({ icao: watchlistTable.icao }).from(watchlistTable);
  if (rows.length === 0) {
    await db.insert(watchlistTable).values({ icao: "LTFH" }).onConflictDoNothing();
    cachedIcaos = ["LTFH"];
  } else {
    cachedIcaos = rows.map((r) => r.icao);
  }
}

async function scanTaf(ids: string) {
  if (!ids) return;
  const data = await fetchJson(`${BASE_URL}/taf?ids=${ids}&format=json`);
  const now = Date.now();
  for (const entry of data as Array<{ icaoId?: string; rawTAF?: string }>) {
    const icao = entry.icaoId;
    const rawTaf = entry.rawTAF ?? "";
    if (!icao) continue;
    sonGorulenTs[icao] = now; // mark as freshly scanned
    if (sonGorulenTaf[icao] !== rawTaf) {
      sonGorulenTaf[icao] = rawTaf;
      if (rawTaf.includes("AMD") || rawTaf.includes("COR")) {
        const alertType = rawTaf.includes("AMD") ? "TAF_AMD" : "TAF_COR";
        await db.insert(alertsTable).values({ type: alertType, icao, rawText: rawTaf });
      }
    }
  }
}

async function scanMetar(ids: string) {
  if (!ids) return;
  const data = await fetchJson(`${BASE_URL}/metar?ids=${ids}&format=json`);
  const now = Date.now();
  for (const entry of data as Array<{ icaoId?: string; rawOb?: string }>) {
    const icao = entry.icaoId;
    const rawMetar = entry.rawOb ?? "";
    if (!icao) continue;
    sonGorulenTs[icao] = now; // mark as freshly scanned
    if (sonGorulenMetar[icao] !== rawMetar) {
      sonGorulenMetar[icao] = rawMetar;
      if (rawMetar.startsWith("SPECI") || rawMetar.includes(" SPECI ")) {
        await db.insert(alertsTable).values({ type: "SPECI", icao, rawText: rawMetar });
      }
    }
  }
}

async function sentinelRadar() {
  try {
    checkDailyReset();
    const icaos = await refreshIcaoCache();
    const ids = icaos.join(",");
    await Promise.all([scanTaf(ids), scanMetar(ids)]);
  } catch (err) {
    console.error("Scan error:", err);
  } finally {
    scanCount++;
    scanCountToday++;
    lastScan = new Date();
  }
}

export function startMonitor() {
  if (running) return;
  running = true;
  void (async () => {
    await seedIfEmpty();
    console.log(`AERO-SENTINEL monitor started — watching ${cachedIcaos.length} airports`);
    await sentinelRadar();
    intervalHandle = setInterval(sentinelRadar, 60_000);
  })();
}

export function stopMonitor() {
  if (intervalHandle) clearInterval(intervalHandle);
  running = false;
}

export function getMonitorState() {
  checkDailyReset();
  return { running, scanCount, scanCountToday, lastScan, monitoredAirports: cachedIcaos.length };
}

export function getAirports(): string[] {
  return cachedIcaos;
}

export function updateCachedIcaos(icaos: string[]) {
  cachedIcaos = icaos;
}

export async function getCurrentTaf(icao: string): Promise<string | null> {
  return sonGorulenTaf[icao] ?? null;
}

export async function getCurrentMetar(icao: string): Promise<string | null> {
  return sonGorulenMetar[icao] ?? null;
}

export function getAllWeather(): Array<{ icao: string; rawMetar: string | null; rawTaf: string | null }> {
  return cachedIcaos.map((icao) => ({
    icao,
    rawMetar: sonGorulenMetar[icao] ?? null,
    rawTaf:   sonGorulenTaf[icao]   ?? null,
  }));
}

export async function fetchWeatherForIcao(
  icao: string,
): Promise<{ rawTaf: string | null; rawMetar: string | null }> {
  const ts      = sonGorulenTs[icao] ?? 0;
  const isFresh = Date.now() - ts < WEATHER_CACHE_MAX_AGE;

  // Return in-memory cache only when it was populated by a recent monitor scan
  if (isFresh && (sonGorulenTaf[icao] !== undefined || sonGorulenMetar[icao] !== undefined)) {
    return {
      rawTaf:   sonGorulenTaf[icao]   ?? null,
      rawMetar: sonGorulenMetar[icao] ?? null,
    };
  }

  // Check display cache before hitting the live API
  const dcEntry = displayCache[icao];
  if (dcEntry && Date.now() - dcEntry.ts < DISPLAY_CACHE_MAX_AGE) {
    return { rawTaf: dcEntry.rawTaf, rawMetar: dcEntry.rawMetar };
  }

  // Cache is stale or this airport hasn't been scanned yet — fetch live from API
  try {
    const [tafData, metarData] = await Promise.all([
      fetchJson(`${BASE_URL}/taf?ids=${icao}&format=json`),
      fetchJson(`${BASE_URL}/metar?ids=${icao}&format=json`),
    ]);
    const rawTaf   = (tafData   as Array<{ rawTAF?: string }>)[0]?.rawTAF ?? null;
    const rawMetar = (metarData as Array<{ rawOb?:  string }>)[0]?.rawOb  ?? null;

    // Store in display cache ONLY — NEVER touch monitor's change-detection state
    displayCache[icao] = { rawTaf, rawMetar, ts: Date.now() };

    return { rawTaf, rawMetar };
  } catch {
    return { rawTaf: null, rawMetar: null };
  }
}
