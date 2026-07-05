/**
 * WCAG 2.1 Contrast Ratio Audit Script (v2 — fixed alpha compositing)
 */

function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  if (hex.length === 8) hex = hex.substring(0, 6); // strip alpha if present
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60)       { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else              { r = c; g = 0; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

function parseHsl(str) {
  const m = str.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+))?\s*\)/i);
  if (!m) return null;
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
}

function parseRgba(str) {
  const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return null;
  return { r: parseFloat(m[1]), g: parseFloat(m[2]), b: parseFloat(m[3]), a: m[4] !== undefined ? parseFloat(m[4]) : 1 };
}

/** Parse ANY color to { r, g, b, a } where a is alpha 0-1 */
function parseColor(color) {
  if (!color) return null;
  if (color.startsWith('#')) {
    const rgb = hexToRgb(color);
    // Check for 8-digit hex (with alpha)
    const clean = color.replace(/^#/, '');
    let a = 1;
    if (clean.length === 8) {
      a = parseInt(clean.substring(6, 8), 16) / 255;
    }
    return { ...rgb, a };
  }
  const hsl = parseHsl(color);
  if (hsl) {
    const rgb = hslToRgb(hsl.h, hsl.s, hsl.l);
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: hsl.a };
  }
  const rgba = parseRgba(color);
  if (rgba) return rgba;
  return null;
}

function toHex(color) {
  const c = parseColor(color);
  if (!c) return color;
  return rgbToHex(c.r, c.g, c.b);
}

function linearize(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(r, g, b) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

function contrastRatio(fg, bg) {
  const fgC = parseColor(fg);
  const bgC = parseColor(bg);
  if (!fgC || !bgC) return NaN;
  const l1 = luminance(fgC.r, fgC.g, fgC.b);
  const l2 = luminance(bgC.r, bgC.g, bgC.b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Alpha-composite fg over bg (both may have alpha). Returns opaque hex. */
function composite(fgColor, bgColor) {
  const fg = parseColor(fgColor);
  const bg = parseColor(bgColor);
  if (!fg) return bgColor;
  if (!bg) return fgColor;
  const a = fg.a;
  const r = fg.r * a + bg.r * (1 - a);
  const g = fg.g * a + bg.g * (1 - a);
  const b = fg.b * a + bg.b * (1 - a);
  const aOut = a + bg.a * (1 - a);
  return rgbToHex(r / aOut, g / aOut, b / aOut);
}

/** Adjust text lightness to meet target contrast against bg, keeping hue/sat */
function adjustTextForContrast(textHex, bgHex, targetRatio = 4.5) {
  const textC = parseColor(textHex);
  const bgC = parseColor(bgHex);
  if (!textC || !bgC) return textHex;
  
  const hsl = rgbToHsl(textC.r, textC.g, textC.b);
  const bgLum = luminance(bgC.r, bgC.g, bgC.b);
  const bgIsDark = bgLum < 0.5;
  
  // Try from current lightness toward 100 (if dark bg) or 0 (if light bg) first
  // Then try the opposite direction
  function tryDir(start, end, step) {
    for (let l = start; bgIsDark ? l <= end : l >= end; l += step) {
      const testRgb = hslToRgb(hsl.h, hsl.s, l);
      const testLum = luminance(testRgb.r, testRgb.g, testRgb.b);
      const ratio = bgIsDark
        ? (testLum + 0.05) / (bgLum + 0.05)
        : (bgLum + 0.05) / (testLum + 0.05);
      if (ratio >= targetRatio) return rgbToHex(testRgb.r, testRgb.g, testRgb.b);
    }
    return null;
  }
  
  // Direction 1: make text more extreme (lighter on dark bg, darker on light bg)
  const dir1 = bgIsDark ? tryDir(hsl.l, 100, 1) : tryDir(hsl.l, 0, -1);
  if (dir1) return dir1;
  
  // Direction 2: opposite
  const dir2 = bgIsDark ? tryDir(hsl.l, 0, -1) : tryDir(hsl.l, 100, 1);
  if (dir2) return dir2;
  
  return textHex;
}

// ── Tailwind color map ───────────────────────────────────────────────────────

const TW = {
  'yellow-400': '#facc15', 'yellow-500': '#eab308',
  'orange-400': '#fb923c', 'orange-500': '#f97316',
  'red-400': '#f87171', 'red-500': '#ef4444',
  'purple-400': '#c084fc', 'purple-500': '#a855f7',
  'rose-400': '#fb7185', 'rose-500': '#f43f5e',
  'indigo-300': '#a5b4fc', 'indigo-600': '#4f46e5',
};

// ── Backgrounds ──────────────────────────────────────────────────────────────

const DARK_CARD = '#151921';
const LIGHT_CARD = '#ffffff';

// ── RESULTS ──────────────────────────────────────────────────────────────────
const results = [];

function audit(component, mode, fg, bg, targetRatio, label) {
  const actualFg = parseColor(fg);
  const actualBg = parseColor(bg);
  if (!actualFg || !actualBg) { console.log(`  ⚠️ SKIP ${component} — unparseable color`); return null; }
  
  // For RGBA fg: composite over bg to get effective fg
  const effectiveFg = actualFg.a < 1 ? composite(fg, bg) : toHex(fg);
  const effectiveBg = actualBg.a < 1 ? composite(bg, DARK_CARD) : toHex(bg);
  // Actually for bg, the alpha bg is composited over card bg
  // For fg with alpha, it's composited over the effective bg
  
  const ratio = contrastRatio(effectiveFg, effectiveBg);
  const pass = ratio >= targetRatio;
  const fixed = !pass ? adjustTextForContrast(effectiveFg, effectiveBg, targetRatio) : null;
  const fixedRatio = fixed ? contrastRatio(fixed, effectiveBg) : null;
  
  results.push({
    component, mode,
    fgOrig: toHex(fg), bgOrig: toHex(bg),
    effectiveFg, effectiveBg,
    fgFixed: fixed ? toHex(fixed) : null,
    ratio: ratio.toFixed(2), pass,
    fixedRatio: fixedRatio ? fixedRatio.toFixed(2) : null,
    label, targetRatio,
  });
  return fixed;
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  1. FLIGHT CATEGORY BADGES');
console.log('═══════════════════════════════════════════════════════════');

const CAT = { VFR: '#22c55e', MVFR: '#3b82f6', IFR: '#ef4444', LIFR: '#a855f7' };

for (const [cat, hex] of Object.entries(CAT)) {
  const darkBg = composite(hex + '18', DARK_CARD);
  const lightBg = composite(hex + '18', LIGHT_CARD);
  audit(`CatBadge ${cat}`, 'dark', hex, darkBg, 4.5, 'text on dark card');
  audit(`CatBadge ${cat}`, 'light', hex, lightBg, 4.5, 'text on light card');
}

// CRIT badge: text-red-400, bg-red-400/10
audit('CRIT badge', 'dark', TW['red-400'], composite(TW['red-400'] + '1a', DARK_CARD), 4.5, 'red-400 on dark');
audit('CRIT badge', 'light', TW['red-400'], composite(TW['red-400'] + '1a', LIGHT_CARD), 4.5, 'red-400 on light');

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  2. ALERT TYPE BADGES (Tailwind classes)');
console.log('═══════════════════════════════════════════════════════════');

const ALERT_BADGES = [
  { type: 'TAF AMD',      text: TW['yellow-400'],  bgBase: TW['yellow-500'],  opacity: 0.15 },
  { type: 'TAF COR',      text: TW['orange-400'],  bgBase: TW['orange-500'],  opacity: 0.15 },
  { type: 'SPECI',        text: TW['red-400'],     bgBase: TW['red-500'],     opacity: 0.15 },
  { type: 'WX EXTREME',   text: TW['purple-400'],  bgBase: TW['purple-500'],  opacity: 0.15 },
  { type: 'WIND EXTREME', text: TW['rose-400'],    bgBase: TW['rose-500'],    opacity: 0.15 },
  { type: 'LIFR',         text: TW['indigo-300'],  bgBase: TW['indigo-600'],  opacity: 0.20 },
];

for (const b of ALERT_BADGES) {
  const opHex = Math.round(b.opacity * 255).toString(16).padStart(2, '0');
  const darkBg = composite(b.bgBase + opHex, DARK_CARD);
  const lightBg = composite(b.bgBase + opHex, LIGHT_CARD);
  audit(`AlertBadge ${b.type}`, 'dark', b.text, darkBg, 4.5, 'text on dark card');
  audit(`AlertBadge ${b.type}`, 'light', b.text, lightBg, 4.5, 'text on light card');
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  3. ALERT ROW CSS CLASSES (index.css)');
console.log('═══════════════════════════════════════════════════════════');

// Light mode alert colors
const ALERT_CSS_LIGHT = {
  'alert-taf-amd':       { text: 'hsl(38 90% 28%)', bg: 'hsl(38 90% 55% / 0.14)' },
  'alert-taf-cor':       { text: 'hsl(22 85% 28%)', bg: 'hsl(22 85% 50% / 0.13)' },
  'alert-speci':         { text: 'hsl(0 80% 32%)',  bg: 'hsl(0 80% 55% / 0.12)' },
  'alert-wx-extreme':    { text: 'hsl(270 70% 35%)', bg: 'hsl(270 70% 55% / 0.12)' },
  'alert-wind-extreme':  { text: 'hsl(350 70% 35%)', bg: 'hsl(350 70% 60% / 0.12)' },
  'alert-lifr':          { text: 'hsl(240 60% 35%)', bg: 'hsl(240 60% 55% / 0.12)' },
};

const ALERT_CSS_DARK = {
  'alert-taf-amd':       { text: 'hsl(45 95% 55%)', bg: 'hsl(45 95% 55% / 0.07)' },
  'alert-taf-cor':       { text: 'hsl(25 90% 60%)', bg: 'hsl(25 90% 60% / 0.07)' },
  'alert-speci':         { text: 'hsl(0 85% 65%)',  bg: 'hsl(0 85% 65% / 0.07)' },
  'alert-wx-extreme':    { text: 'hsl(270 80% 70%)', bg: 'hsl(270 80% 70% / 0.07)' },
  'alert-wind-extreme':  { text: 'hsl(350 80% 68%)', bg: 'hsl(350 80% 68% / 0.07)' },
  'alert-lifr':          { text: 'hsl(240 80% 72%)', bg: 'hsl(240 80% 72% / 0.07)' },
};

for (const [name, cfg] of Object.entries(ALERT_CSS_DARK)) {
  // bg tint is composited on card
  const effectiveBg = composite(cfg.bg, DARK_CARD);
  audit(`CSS ${name}`, 'dark', cfg.text, effectiveBg, 4.5, 'text on effective dark bg');
}
for (const [name, cfg] of Object.entries(ALERT_CSS_LIGHT)) {
  const effectiveBg = composite(cfg.bg, LIGHT_CARD);
  audit(`CSS ${name}`, 'light', cfg.text, effectiveBg, 4.5, 'text on effective light bg');
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  4. STAT CARDS (Alerts.tsx)');
console.log('═══════════════════════════════════════════════════════════');

const STAT_CARDS = [
  { label: 'Total',    numberColor: 'rgba(100,116,139,0.9)', labelColor: 'rgba(100,116,139,0.5)', bg: 'rgba(100,116,139,0.06)', border: 'rgba(100,116,139,0.15)' },
  { label: 'Unacked',  numberColor: '#e24b4a', labelColor: 'rgba(226,75,74,0.6)', bg: 'rgba(226,75,74,0.08)', border: 'rgba(226,75,74,0.25)' },
  { label: 'TAF Rev',  numberColor: '#ef9f27', labelColor: 'rgba(239,159,39,0.6)', bg: 'rgba(239,159,39,0.07)', border: 'rgba(239,159,39,0.2)' },
  { label: 'SPECI',    numberColor: '#ff8c32', labelColor: 'rgba(255,140,50,0.6)', bg: 'rgba(255,140,50,0.07)', border: 'rgba(255,140,50,0.2)' },
  { label: 'CRIT WX',  numberColor: '#a855f7', labelColor: 'rgba(168,85,247,0.6)', bg: 'rgba(168,85,247,0.07)', border: 'rgba(168,85,247,0.2)' },
];

for (const card of STAT_CARDS) {
  // Compose stat card bg over card bg
  const darkStatBg = composite(card.bg, DARK_CARD);
  const lightStatBg = composite(card.bg, LIGHT_CARD);
  
  // Number (large text ≥ 18pt, target 3:1)
  audit(`StatCard ${card.label} #`, 'dark', card.numberColor, darkStatBg, 3.0, 'number on dark (large text)');
  audit(`StatCard ${card.label} #`, 'light', card.numberColor, lightStatBg, 3.0, 'number on light (large text)');
  
  // Label (small text, target 4.5:1)
  audit(`StatCard ${card.label} lbl`, 'dark', card.labelColor, darkStatBg, 4.5, 'label on dark stat bg');
  audit(`StatCard ${card.label} lbl`, 'light', card.labelColor, lightStatBg, 4.5, 'label on light stat bg');
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  5. BUTTON TEXT (Alerts.tsx)');
console.log('═══════════════════════════════════════════════════════════');

const BUTTONS = [
  { name: 'CHANGES', color: '#38bdf8', bg: 'rgba(56,189,248,0.08)' },
  { name: 'ACK',     color: '#10b981', bg: 'rgba(16,185,129,0.12)' },
  { name: 'REFRESH', color: '#38bdf8', bg: 'rgba(56,189,248,0.08)' },
];

for (const btn of BUTTONS) {
  const darkBg = composite(btn.bg, DARK_CARD);
  const lightBg = composite(btn.bg, LIGHT_CARD);
  audit(`Button ${btn.name}`, 'dark', btn.color, darkBg, 4.5, 'text on dark');
  audit(`Button ${btn.name}`, 'light', btn.color, lightBg, 4.5, 'text on light');
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  6. COLORED RAW TEXT TOKENS (metarParser.ts)');
console.log('═══════════════════════════════════════════════════════════');

const TOKENS = [
  { name: 'Station/METAR/SPECI', color: '#38BDF8' },
  { name: 'Danger wind/wx',      color: '#ef4444' },
  { name: 'Strong wind/orange',  color: '#f97316' },
  { name: 'LIFR vis/ceil',       color: '#a855f7' },
  { name: 'Time/RVR/CAVOK',     color: '#64748b' },
  { name: 'Cloud/temp/press',   color: '#94a3b8' },
  { name: 'CB/BR/HZ',           color: '#d1a054' },
];

for (const tok of TOKENS) {
  audit(`Token ${tok.name}`, 'dark', tok.color, DARK_CARD, 4.5, 'on dark card');
  audit(`Token ${tok.name}`, 'light', tok.color, LIGHT_CARD, 4.5, 'on light card');
}

// ── PRINT RESULTS ────────────────────────────────────────────────────────────

console.log('\n\n');
console.log('╔═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                                            WCAG 2.1 CONTRAST AUDIT RESULTS (v2)                                           ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════════╝\n');

let failCount = 0, passCount = 0;

for (const r of results) {
  const status = r.pass ? '✅' : '❌';
  const mode = r.mode === 'dark' ? '🌙' : '☀️';
  if (!r.pass) failCount++; else passCount++;
  
  const fix = r.fgFixed 
    ? ` → fix: ${r.fgFixed} = ${r.fixedRatio}:1 ${parseFloat(r.fixedRatio) >= r.targetRatio ? '✅' : '❌'}`
    : '';
  
  console.log(`  ${status} ${mode} ${r.component.padEnd(28)} [${r.effectiveFg}] on [${r.effectiveBg}] = ${r.ratio}:1 (need ${r.targetRatio}:1)${fix}`);
}

console.log(`\n  TOTAL: ${results.length} checks | ${passCount} ✅ | ${failCount} ❌\n`);

// Summary of fixes needed
const failed = results.filter(r => !r.pass);
console.log('═══════════════════════════════════════════════════════════');
console.log('  FIXES SUMMARY');
console.log('═══════════════════════════════════════════════════════════');
for (const r of failed) {
  if (r.fgFixed && parseFloat(r.fixedRatio) >= r.targetRatio) {
    console.log(`  FIX ${r.mode} ${r.component}: ${r.effectiveFg} → ${r.fgFixed} (${r.fixedRatio}:1)`);
  } else {
    console.log(`  ??? ${r.mode} ${r.component}: ${r.effectiveFg} on ${r.effectiveBg} = ${r.ratio}:1 — needs manual fix`);
  }
}
