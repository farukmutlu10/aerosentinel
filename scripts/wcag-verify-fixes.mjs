/**
 * WCAG 2.1 Contrast Ratio Verification (v3) — Post-fix audit
 * Uses the fixed color values from CSS custom properties.
 */

function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
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
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

function linearize(c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
function luminance(r, g, b) { return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b); }
function contrastRatio(a, b) { const la = luminance(a.r, a.g, a.b); const lb = luminance(b.r, b.g, b.b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
function composite(fg, bg) { const a = fg.a ?? 1; return { r: fg.r * a + bg.r * (1-a), g: fg.g * a + bg.g * (1-a), b: fg.b * a + bg.b * (1-a) }; }

function parseRgba(str) {
  const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!m) return null;
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
}

// ── Define the FIXED colors (from CSS custom properties) ──

// Light mode fixed colors
const L = {
  card: { r: 255, g: 255, b: 255 },
  catVfr: hslToRgb(142, 70, 29),    // #167f3d
  catMvfr: hslToRgb(217, 91, 48),   // #0a5de0
  catIfr: hslToRgb(0, 84, 44),      // #d11212
  catLifr: hslToRgb(271, 91, 55),   // #8c21ef
  wxBlue: hslToRgb(198, 93, 35),    // #067baf
  wxRed: hslToRgb(0, 84, 50),       // #eb1515
  wxOrange: hslToRgb(25, 95, 39),   // #c35305
  wxPurple: hslToRgb(271, 91, 61),  // #9e42f6
  wxSlate: hslToRgb(214, 20, 48),   // #627793
  wxSlateDim: hslToRgb(214, 15, 46),// #647386
  wxAmber: hslToRgb(36, 57, 37),    // #936728
  statAmber: hslToRgb(36, 86, 43),  // #ca7f0f
  statOrange: hslToRgb(26, 100, 46),// #ea6700
  statLblSlate: hslToRgb(214, 15, 46), // #647386
  statLblRed: hslToRgb(0, 73, 49),     // #d82222
  statLblAmber: hslToRgb(36, 86, 34),  // #9f640c
  statLblOrange: hslToRgb(27, 100, 35),// #b35000
  statLblPurple: hslToRgb(270, 91, 59),// #9837f6
  btnBlue: hslToRgb(199, 93, 35),   // #0678ab
  btnGreen: hslToRgb(160, 84, 26),  // #0b7c56
};

// Dark mode fixed colors
const D = {
  card: hslToRgb(220, 18, 10),
  catVfr: hslToRgb(142, 71, 45),    // #22c55e
  catMvfr: hslToRgb(217, 91, 62),   // #4588f6
  catIfr: hslToRgb(0, 84, 62),      // #f04d4d
  catLifr: hslToRgb(270, 91, 69),   // #b167f9
  wxBlue: hslToRgb(198, 93, 60),    // #38bdf8
  wxRed: hslToRgb(0, 84, 60),       // #ef4444
  wxOrange: hslToRgb(25, 95, 53),   // #f97316
  wxPurple: hslToRgb(271, 91, 66),  // #aa5af7
  wxSlate: hslToRgb(215, 16, 53),   // #73839a
  wxSlateDim: hslToRgb(217, 17, 57),// #7e8ca3
  wxAmber: hslToRgb(36, 58, 57),    // #d1a054
  statAmber: hslToRgb(36, 86, 55),  // #ef9f27
  statOrange: hslToRgb(26, 100, 60),// #ff8c32
  statLblSlate: hslToRgb(217, 17, 55), // #78879f
  statLblRed: hslToRgb(359, 45, 61),   // #c86d6f
  statLblAmber: hslToRgb(36, 62, 44),  // #b77e2b
  statLblOrange: hslToRgb(26, 59, 49), // #c87434
  statLblPurple: hslToRgb(269, 45, 63),// #9f76cb
  btnBlue: hslToRgb(198, 93, 60),   // #38bdf8
  btnGreen: hslToRgb(160, 84, 39),  // #10b981
};

// Stat card backgrounds composited on card bg
function statBg(hsl, card) { return composite({ ...hsl, a: 0.08 }, card); }
function btnBg(hsl, card, alpha) { return composite({ ...hsl, a: alpha }, card); }

const results = [];
function audit(name, mode, fg, bg, target) {
  const ratio = contrastRatio(fg, bg);
  const pass = ratio >= target;
  const status = pass ? '✅' : '❌';
  results.push({ name, mode, pass, ratio, target });
  console.log(`  ${status} ${mode === 'dark' ? '🌙' : '☀️'} ${name.padEnd(30)} ${rgbToHex(fg.r, fg.g, fg.b)} on ${rgbToHex(bg.r, bg.g, bg.b)} = ${ratio.toFixed(2)}:1 (need ${target}:1)`);
}

console.log('╔═══════════════════════════════════════════════════════════════════════════════════╗');
console.log('║                    WCAG 2.1 POST-FIX VERIFICATION (v3)                           ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════════════╝\n');

console.log('── 1. FLIGHT CATEGORY BADGES ──');
// Badge bg = cat color at 9.4% opacity on card
const badgeBg = (cat, card) => composite({ ...cat, a: 0.094 }, card);
audit('VFR badge', 'light', L.catVfr, badgeBg(L.catVfr, L.card), 4.5);
audit('VFR badge', 'dark', D.catVfr, badgeBg(D.catVfr, D.card), 4.5);
audit('MVFR badge', 'light', L.catMvfr, badgeBg(L.catMvfr, L.card), 4.5);
audit('MVFR badge', 'dark', D.catMvfr, badgeBg(D.catMvfr, D.card), 4.5);
audit('IFR badge', 'light', L.catIfr, badgeBg(L.catIfr, L.card), 4.5);
audit('IFR badge', 'dark', D.catIfr, badgeBg(D.catIfr, D.card), 4.5);
audit('LIFR badge', 'light', L.catLifr, badgeBg(L.catLifr, L.card), 4.5);
audit('LIFR badge', 'dark', D.catLifr, badgeBg(D.catLifr, D.card), 4.5);

console.log('\n── 2. ALERT ROW CSS CLASSES ──');
// Light: dark text on white card (tinted bg is only 7-14%, negligible)
audit('alert-taf-amd', 'light', hslToRgb(38, 90, 28), L.card, 4.5);
audit('alert-taf-amd', 'dark', hslToRgb(45, 95, 55), D.card, 4.5);
audit('alert-taf-cor', 'light', hslToRgb(22, 85, 28), L.card, 4.5);
audit('alert-taf-cor', 'dark', hslToRgb(25, 90, 60), D.card, 4.5);
audit('alert-speci', 'light', hslToRgb(0, 80, 32), L.card, 4.5);
audit('alert-speci', 'dark', hslToRgb(0, 85, 65), D.card, 4.5);
audit('alert-wx-extreme', 'light', hslToRgb(270, 70, 35), L.card, 4.5);
audit('alert-wx-extreme', 'dark', hslToRgb(270, 80, 70), D.card, 4.5);
audit('alert-wind-extreme', 'light', hslToRgb(350, 70, 35), L.card, 4.5);
audit('alert-wind-extreme', 'dark', hslToRgb(350, 80, 68), D.card, 4.5);
audit('alert-lifr', 'light', hslToRgb(240, 60, 35), L.card, 4.5);
audit('alert-lifr', 'dark', hslToRgb(240, 80, 72), D.card, 4.5);

console.log('\n── 3. STAT CARDS ──');
audit('Total #', 'light', { r:100, g:116, b:139, a:0.9 }, L.card, 3.0);
audit('Total #', 'dark', { r:100, g:116, b:139, a:0.9 }, D.card, 3.0);
audit('Total lbl', 'light', L.statLblSlate, L.card, 4.5);
audit('Total lbl', 'dark', D.statLblSlate, D.card, 4.5);
audit('Unacked #', 'light', { r:226, g:75, b:74 }, L.card, 3.0);
audit('Unacked #', 'dark', { r:226, g:75, b:74 }, D.card, 3.0);
audit('Unacked lbl', 'light', L.statLblRed, composite({r:226,g:75,b:74,a:0.08}, L.card), 4.5);
audit('Unacked lbl', 'dark', D.statLblRed, composite({r:226,g:75,b:74,a:0.08}, D.card), 4.5);
audit('TAF Rev #', 'light', L.statAmber, L.card, 3.0);
audit('TAF Rev #', 'dark', D.statAmber, D.card, 3.0);
audit('TAF Rev lbl', 'light', L.statLblAmber, composite({r:239,g:159,b:39,a:0.07}, L.card), 4.5);
audit('TAF Rev lbl', 'dark', D.statLblAmber, composite({r:239,g:159,b:39,a:0.07}, D.card), 4.5);
audit('SPECI #', 'light', L.statOrange, L.card, 3.0);
audit('SPECI #', 'dark', D.statOrange, D.card, 3.0);
audit('SPECI lbl', 'light', L.statLblOrange, composite({r:255,g:140,b:50,a:0.07}, L.card), 4.5);
audit('SPECI lbl', 'dark', D.statLblOrange, composite({r:255,g:140,b:50,a:0.07}, D.card), 4.5);
audit('CRIT WX #', 'light', L.catLifr, L.card, 3.0);
audit('CRIT WX #', 'dark', D.catLifr, D.card, 3.0);
audit('CRIT WX lbl', 'light', L.statLblPurple, composite({r:168,g:85,b:247,a:0.07}, L.card), 4.5);
audit('CRIT WX lbl', 'dark', D.statLblPurple, composite({r:168,g:85,b:247,a:0.07}, D.card), 4.5);

console.log('\n── 4. BUTTONS ──');
audit('CHANGES', 'light', L.btnBlue, composite({r:56,g:189,b:248,a:0.08}, L.card), 4.5);
audit('CHANGES', 'dark', D.btnBlue, composite({r:56,g:189,b:248,a:0.08}, D.card), 4.5);
audit('ACK', 'light', L.btnGreen, composite({r:16,g:185,b:129,a:0.12}, L.card), 4.5);
audit('ACK', 'dark', D.btnGreen, composite({r:16,g:185,b:129,a:0.12}, D.card), 4.5);
audit('REFRESH', 'light', L.btnBlue, composite({r:56,g:189,b:248,a:0.08}, L.card), 4.5);
audit('REFRESH', 'dark', D.btnBlue, composite({r:56,g:189,b:248,a:0.08}, D.card), 4.5);

console.log('\n── 5. TOKEN COLORS ──');
audit('Station/METAR', 'light', L.wxBlue, L.card, 4.5);
audit('Station/METAR', 'dark', D.wxBlue, D.card, 4.5);
audit('Danger wind/wx', 'light', L.wxRed, L.card, 4.5);
audit('Danger wind/wx', 'dark', D.wxRed, D.card, 4.5);
audit('Strong wind', 'light', L.wxOrange, L.card, 4.5);
audit('Strong wind', 'dark', D.wxOrange, D.card, 4.5);
audit('LIFR vis/ceil', 'light', L.wxPurple, L.card, 4.5);
audit('LIFR vis/ceil', 'dark', D.wxPurple, D.card, 4.5);
audit('Time/RVR', 'light', L.wxSlateDim, L.card, 4.5);
audit('Time/RVR', 'dark', D.wxSlateDim, D.card, 4.5);
audit('Cloud/temp', 'light', L.wxSlate, L.card, 4.5);
audit('Cloud/temp', 'dark', D.wxSlate, D.card, 4.5);
audit('CB/BR/HZ', 'light', L.wxAmber, L.card, 4.5);
audit('CB/BR/HZ', 'dark', D.wxAmber, D.card, 4.5);

// Summary
let pass = results.filter(r => r.pass).length;
let fail = results.filter(r => !r.pass).length;
console.log(`\n\n  TOTAL: ${results.length} checks | ${pass} ✅ | ${fail} ❌`);
if (fail === 0) console.log('\n  🎉 ALL CHECKS PASSED — WCAG 2.1 AA COMPLIANT');
else {
  console.log('\n  ⚠️  FAILURES:');
  results.filter(r => !r.pass).forEach(r => console.log(`    ❌ ${r.mode} ${r.name}: ${r.ratio.toFixed(2)}:1 (need ${r.target}:1)`));
}
