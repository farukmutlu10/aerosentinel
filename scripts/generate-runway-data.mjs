#!/usr/bin/env node
// Downloads OurAirports' public runways.csv (CC0 / public domain) and
// converts it into a compact ICAO -> runway[] JSON lookup consumed by the
// API server (artifacts/api-server/src/data/runways.json). Also computes
// each runway's magnetic variation (WMM, via the `geomagnetism` package)
// from its own le/he coordinates, so the frontend can offer a True vs
// Magnetic North toggle for wind calculations.
//
// Usage:
//   node scripts/generate-runway-data.mjs                 (fetches from SOURCE_URL)
//   node scripts/generate-runway-data.mjs /path/to/runways.csv  (uses a local file instead)
// Re-run periodically to pick up new/changed runways (rare — runway
// construction takes years, so this is not part of the normal build).

import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import geomagnetismPkg from "geomagnetism";

const SOURCE_URL = "https://davidmegginson.github.io/ourairports-data/runways.csv";
const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "artifacts",
  "api-server",
  "src",
  "data",
  "runways.json",
);

const geomagnetism = geomagnetismPkg.default ?? geomagnetismPkg;
const magModel = geomagnetism.model(new Date());

/** Magnetic variation (declination, degrees — positive = East) at a point, or null if coords are missing. */
function declinationAt(lat, lon) {
  if (lat === null || lon === null) return null;
  return Math.round(magModel.point([lat, lon]).decl * 10) / 10;
}

// OurAirports has a handful of runway designators that are stale (airports
// occasionally get renumbered as magnetic variation drifts, and the source
// dataset isn't always updated). Known corrections, keyed by ICAO, applied
// after parsing so a re-run of this script doesn't silently regress them.
const DESIGNATOR_CORRECTIONS = {
  // LTCN (Çanakkale): true heading 76°/256° is correct, but at ~5.9°E
  // variation that's magnetic ~070°/250° today, not the source's 08/26.
  LTCN: { "08": "07", "26": "25" },
};

function applyDesignatorCorrections(icao, runway) {
  const fix = DESIGNATOR_CORRECTIONS[icao];
  if (!fix) return runway;
  const leIdent = fix[runway.leIdent] ?? runway.leIdent;
  const heIdent = fix[runway.heIdent] ?? runway.heIdent;
  return { ...runway, leIdent, heIdent, designator: `${leIdent}/${heIdent}` };
}

/** Minimal RFC4180 CSV line parser (handles quoted fields, no embedded newlines in this dataset). */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { fields.push(cur); cur = ""; }
      else cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function toNumberOrNull(s) {
  if (s === undefined || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function main() {
  const localPath = process.argv[2];
  let csv;
  if (localPath) {
    console.log(`Reading local file ${localPath} ...`);
    csv = readFileSync(localPath, "utf-8");
  } else {
    console.log(`Fetching ${SOURCE_URL} ...`);
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Failed to fetch runways.csv: HTTP ${res.status}`);
    csv = await res.text();
  }
  const lines = csv.split("\n").filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((name, i) => [name, i]));

  /** @type {Record<string, Array<{designator:string,leIdent:string,heIdent:string,leHeadingDegT:number|null,heHeadingDegT:number|null,lengthFt:number|null,surface:string|null,magVarDeg:number|null}>>} */
  const byIcao = {};
  let kept = 0;
  let skippedClosed = 0;

  for (let i = 1; i < lines.length; i++) {
    const f = parseCsvLine(lines[i]);
    const closed = f[col.closed];
    if (closed === "1") { skippedClosed++; continue; }

    const icao = (f[col.airport_ident] ?? "").trim().toUpperCase();
    const leIdent = (f[col.le_ident] ?? "").trim();
    const heIdent = (f[col.he_ident] ?? "").trim();
    if (!icao || !leIdent || !heIdent) continue;

    const leLat = toNumberOrNull(f[col.le_latitude_deg]);
    const leLon = toNumberOrNull(f[col.le_longitude_deg]);
    const heLat = toNumberOrNull(f[col.he_latitude_deg]);
    const heLon = toNumberOrNull(f[col.he_longitude_deg]);
    // Average of both ends when available — a runway's own footprint is far
    // smaller than the WMM's spatial resolution, so this is effectively exact.
    const midLat = leLat !== null && heLat !== null ? (leLat + heLat) / 2 : (leLat ?? heLat);
    const midLon = leLon !== null && heLon !== null ? (leLon + heLon) / 2 : (leLon ?? heLon);

    const runway = applyDesignatorCorrections(icao, {
      designator: `${leIdent}/${heIdent}`,
      leIdent,
      heIdent,
      leHeadingDegT: toNumberOrNull(f[col.le_heading_degT]),
      heHeadingDegT: toNumberOrNull(f[col.he_heading_degT]),
      lengthFt: toNumberOrNull(f[col.length_ft]),
      surface: (f[col.surface] ?? "").trim() || null,
      magVarDeg: midLat !== undefined && midLon !== undefined ? declinationAt(midLat ?? null, midLon ?? null) : null,
    });

    (byIcao[icao] ??= []).push(runway);
    kept++;
  }

  writeFileSync(OUT_PATH, JSON.stringify(byIcao));
  console.log(`Wrote ${OUT_PATH}`);
  console.log(`Airports: ${Object.keys(byIcao).length} | runways kept: ${kept} | closed skipped: ${skippedClosed}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
