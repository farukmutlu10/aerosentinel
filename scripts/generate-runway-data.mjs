#!/usr/bin/env node
// Downloads OurAirports' public runways.csv (CC0 / public domain) and
// converts it into a compact ICAO -> runway[] JSON lookup consumed by the
// API server (artifacts/api-server/src/data/runways.json).
//
// Usage: node scripts/generate-runway-data.mjs
// Re-run periodically to pick up new/changed runways (rare — runway
// construction takes years, so this is not part of the normal build).

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`Failed to fetch runways.csv: HTTP ${res.status}`);
  const csv = await res.text();
  const lines = csv.split("\n").filter((l) => l.trim().length > 0);
  const header = parseCsvLine(lines[0]);
  const col = Object.fromEntries(header.map((name, i) => [name, i]));

  /** @type {Record<string, Array<{designator:string,leIdent:string,heIdent:string,leHeadingDegT:number|null,heHeadingDegT:number|null,lengthFt:number|null,surface:string|null}>>} */
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

    const runway = {
      designator: `${leIdent}/${heIdent}`,
      leIdent,
      heIdent,
      leHeadingDegT: toNumberOrNull(f[col.le_heading_degT]),
      heHeadingDegT: toNumberOrNull(f[col.he_heading_degT]),
      lengthFt: toNumberOrNull(f[col.length_ft]),
      surface: (f[col.surface] ?? "").trim() || null,
    };

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
