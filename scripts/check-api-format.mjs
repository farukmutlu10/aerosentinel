#!/usr/bin/env node
// Quick script to check aviationweather.gov API response format

async function checkTaf() {
  console.log('=== TAF API Response for UAKD ===');
  const res = await fetch('https://aviationweather.gov/api/data/taf?ids=UAKD&format=json');
  const data = await res.json();
  if (data.length === 0) { console.log('No TAF data returned'); return; }
  const entry = data[0];
  console.log('Available keys:', Object.keys(entry).join(', '));
  console.log('rawTAF present:', entry.rawTAF !== undefined);
  console.log('rawTAF starts with:', (entry.rawTAF || '').substring(0, 60));
  console.log('tafType present:', entry.tafType !== undefined);
  console.log('tafType value:', entry.tafType ?? 'NOT_FOUND');
  console.log('prior value:', entry.prior ?? 'NOT_FOUND');
  console.log('');
}

async function checkMetar() {
  console.log('=== METAR API Response for UBBN ===');
  const res = await fetch('https://aviationweather.gov/api/data/metar?ids=UBBN&format=json');
  const data = await res.json();
  if (data.length === 0) { console.log('No METAR data returned'); return; }
  const entry = data[0];
  console.log('Available keys:', Object.keys(entry).join(', '));
  console.log('rawOb present:', entry.rawOb !== undefined);
  console.log('rawOb starts with:', (entry.rawOb || '').substring(0, 60));
  console.log('metarType present:', entry.metarType !== undefined);
  console.log('metarType value:', entry.metarType ?? 'NOT_FOUND');
  console.log('');
}

async function checkMetarSpeci() {
  // Try to find an airport that might have a SPECI
  console.log('=== METAR API Response for EGLL (busy airport, likely has SPECI) ===');
  const res = await fetch('https://aviationweather.gov/api/data/metar?ids=EGLL&format=json');
  const data = await res.json();
  if (data.length === 0) { console.log('No METAR data returned'); return; }
  const entry = data[0];
  console.log('Available keys:', Object.keys(entry).join(', '));
  console.log('rawOb present:', entry.rawOb !== undefined);
  console.log('rawOb starts with:', (entry.rawOb || '').substring(0, 80));
  console.log('metarType present:', entry.metarType !== undefined);
  console.log('metarType value:', entry.metarType ?? 'NOT_FOUND');
  console.log('');
}

async function main() {
  await checkTaf();
  await checkMetar();
  await checkMetarSpeci();
}

main().catch(console.error);
