import { db, alertsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const MEYDANLAR =
  "LTFJ,LTAC,HCMM,LTBJ,LTAU,LTAJ,LTAI,LTCG,LTCB,LTCE,LTCI,ORER,OSAP,LTFO,LTCR,OLBA,LTCC,LCEN,LTBS,LTDB,LTCN,LTCV,LTCO,LTFE,LTAZ,LTCS,LTCF,LKPR,LTCP,LTFH,EBBR,LFPG,EGSS,EHAM,EDDV,EKCH,EDDB,LIRF,EDDL,LIME,LSGG,EDDM,EDDF,LOWW,EDDS,UBBB,LTFM,LTCT,LQSA,LTBR,LTCK,LTCD,LTCA,LTDA,LTAW,LTCJ,LTBH,UUWW,ULLI,HECA,EDDK,UGTB,OEJN,OEMA,HESH,LTAT,HEGN,UCFM,UACC,UTTT,LTAN,LSZH,ESSA,EDDH,LYBE,OSDI,LTAR,LTAY,OERK,LATI,EHRD,LFLL,LTFG,LWSK,UAAA,ORBI,BKPR,LEBL,LHBP,DAAG,LROP,LEMD,LQTZ,HDAM,LTBA";

export const AIRPORTS = MEYDANLAR.split(",");

const sonGorulenTaf: Record<string, string> = {};
const sonGorulenMetar: Record<string, string> = {};

let scanCount = 0;
let lastScan: Date | null = null;
let running = false;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

const HEADERS = { "User-Agent": "Mozilla/5.0 AERO-SENTINEL/1.5" };
const BASE_URL = "https://aviationweather.gov/api/data";

async function fetchJson(url: string): Promise<unknown[]> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return [];
  return (await res.json()) as unknown[];
}

async function scanTaf() {
  const data = await fetchJson(`${BASE_URL}/taf?ids=${MEYDANLAR}&format=json`);
  for (const entry of data as Array<{ icaoId?: string; rawTAF?: string }>) {
    const icao = entry.icaoId;
    const rawTaf = entry.rawTAF ?? "";
    if (!icao) continue;

    if (sonGorulenTaf[icao] !== rawTaf) {
      sonGorulenTaf[icao] = rawTaf;
      if (rawTaf.includes("AMD") || rawTaf.includes("COR")) {
        const alertType = rawTaf.includes("AMD") ? "TAF_AMD" : "TAF_COR";
        await db.insert(alertsTable).values({
          type: alertType,
          icao,
          rawText: rawTaf,
        });
      }
    }
  }
}

async function scanMetar() {
  const data = await fetchJson(`${BASE_URL}/metar?ids=${MEYDANLAR}&format=json`);
  for (const entry of data as Array<{ icaoId?: string; rawOb?: string }>) {
    const icao = entry.icaoId;
    const rawMetar = entry.rawOb ?? "";
    if (!icao) continue;

    if (sonGorulenMetar[icao] !== rawMetar) {
      sonGorulenMetar[icao] = rawMetar;
      if (rawMetar.startsWith("SPECI") || rawMetar.includes(" SPECI ")) {
        await db.insert(alertsTable).values({
          type: "SPECI",
          icao,
          rawText: rawMetar,
        });
      }
    }
  }
}

async function sentinelRadar() {
  try {
    await Promise.all([scanTaf(), scanMetar()]);
  } catch (err) {
    console.error("Scan error:", err);
  } finally {
    scanCount++;
    lastScan = new Date();
  }
}

export function startMonitor() {
  if (running) return;
  running = true;
  console.log("AERO-SENTINEL monitor started — scanning every 60s");
  sentinelRadar();
  intervalHandle = setInterval(sentinelRadar, 60_000);
}

export function stopMonitor() {
  if (intervalHandle) clearInterval(intervalHandle);
  running = false;
}

export function getMonitorState() {
  return { running, scanCount, lastScan, monitoredAirports: AIRPORTS.length };
}

export async function getCurrentTaf(icao: string): Promise<string | null> {
  return sonGorulenTaf[icao] ?? null;
}

export async function getCurrentMetar(icao: string): Promise<string | null> {
  return sonGorulenMetar[icao] ?? null;
}

export function getAllWeather(): Array<{ icao: string; rawMetar: string | null; rawTaf: string | null }> {
  return AIRPORTS.map((icao) => ({
    icao,
    rawMetar: sonGorulenMetar[icao] ?? null,
    rawTaf: sonGorulenTaf[icao] ?? null,
  }));
}

export async function fetchWeatherForIcao(icao: string): Promise<{ rawTaf: string | null; rawMetar: string | null }> {
  const cachedTaf = sonGorulenTaf[icao];
  const cachedMetar = sonGorulenMetar[icao];
  if (cachedTaf !== undefined || cachedMetar !== undefined) {
    return { rawTaf: cachedTaf ?? null, rawMetar: cachedMetar ?? null };
  }
  try {
    const [tafData, metarData] = await Promise.all([
      fetchJson(`${BASE_URL}/taf?ids=${icao}&format=json`),
      fetchJson(`${BASE_URL}/metar?ids=${icao}&format=json`),
    ]);
    const rawTaf = (tafData as Array<{ rawTAF?: string }>)[0]?.rawTAF ?? null;
    const rawMetar = (metarData as Array<{ rawOb?: string }>)[0]?.rawOb ?? null;
    return { rawTaf, rawMetar };
  } catch {
    return { rawTaf: null, rawMetar: null };
  }
}
