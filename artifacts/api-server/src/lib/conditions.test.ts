/**
 * Tests for pure weather condition detection functions.
 * Run with: npx tsx src/lib/conditions.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hasLifrConditions, getActiveTafPeriod, getActiveTempos, hasWxExtreme, hasWindExtreme } from "./conditions.ts";

// ── hasLifrConditions ──────────────────────────────────────────────────────

describe("hasLifrConditions", () => {
  it("returns false for CAVOK", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z CAVOK 20/10"), false);
  });

  it("returns false for normal visibility (9999)", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008KT 9999 BKN030"), false);
  });

  it("returns true for low visibility (<1600m)", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008KT 0800 BKN005"), true);
  });

  it("returns true for visibility exactly 1500m (boundary — <1600)", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008KT 1500 BKN005"), true);
  });

  it("returns false for visibility exactly 1600m (boundary — not LIFR)", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008KT 1600 BKN030"), false);
  });

  it("returns false for visibility 2000m", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008KT 2000 BKN030"), false);
  });

  it("returns true for low ceiling (<500ft = BKN004)", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008KT 9999 BKN004"), true);
  });

  it("returns false for ceiling at 500ft (BKN005)", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008KT 9999 BKN005"), false);
  });

  it("returns true for OVC ceiling <500ft", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008KT 9999 OVC003"), true);
  });

  it("returns true for VV (vertical visibility) <500ft", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008KT 0200 VV002"), true);
  });

  it("handles variable wind direction (dddVddd) between wind and visibility", () => {
    // This is the B3 fix case: "18008G15KT 150V210 0800"
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008G15KT 150V210 0800"), true);
  });

  it("handles variable wind with normal visibility", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18008G15KT 150V210 9999"), false);
  });

  it("handles VRB wind direction", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z VRB03KT 0600"), true);
  });

  it("handles MPS unit", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18004MPS 0800"), true);
  });

  it("handles KMH unit", () => {
    assert.equal(hasLifrConditions("METAR LTFH 120600Z 18010KMH 0800"), true);
  });

  it("returns false for empty string", () => {
    assert.equal(hasLifrConditions(""), false);
  });
});

// ── getActiveTafPeriod ─────────────────────────────────────────────────────

describe("getActiveTafPeriod", () => {
  it("returns null when no FM groups exist", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 BKN030";
    assert.equal(getActiveTafPeriod(taf), null);
  });

  it("returns BASE when current time is before first FM", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 FM121800 24008KT 9999";
    const now = new Date(Date.UTC(2026, 0, 12, 10, 0)); // 12th at 10:00 UTC
    const result = getActiveTafPeriod(taf, now);
    assert.ok(result);
    assert.equal(result.key, "BASE");
    assert.ok(result.text.includes("18012KT"));
  });

  it("returns FM segment when current time is after FM", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 FM121800 24008KT 9999";
    const now = new Date(Date.UTC(2026, 0, 12, 19, 0)); // 12th at 19:00 UTC
    const result = getActiveTafPeriod(taf, now);
    assert.ok(result);
    assert.equal(result.key, "FM121800");
    assert.ok(result.text.includes("24008KT"));
  });

  it("returns latest FM when multiple FMs exist", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 FM121200 20010KT 9999 FM121800 24008KT 5000";
    const now = new Date(Date.UTC(2026, 0, 12, 20, 0)); // 12th at 20:00 UTC
    const result = getActiveTafPeriod(taf, now);
    assert.ok(result);
    assert.equal(result.key, "FM121800");
    assert.ok(result.text.includes("24008KT"));
    assert.ok(result.text.includes("5000"));
  });

  it("returns first FM when time is between two FMs", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 FM121200 20010KT 9999 FM121800 24008KT 5000";
    const now = new Date(Date.UTC(2026, 0, 12, 14, 0)); // 12th at 14:00 UTC
    const result = getActiveTafPeriod(taf, now);
    assert.ok(result);
    assert.equal(result.key, "FM121200");
    assert.ok(result.text.includes("20010KT"));
  });
});

// ── getActiveTempos ────────────────────────────────────────────────────────

describe("getActiveTempos", () => {
  it("returns empty array when no TEMPO/BECMG groups exist", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 FM121800 24008KT 9999";
    const now = new Date(Date.UTC(2026, 0, 12, 10, 0));
    assert.deepEqual(getActiveTempos(taf, now), []);
  });

  it("returns TEMPO weather when currently active", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 TEMPO 1212/1218 +TSRA FM121800 24008KT 9999";
    const now = new Date(Date.UTC(2026, 0, 12, 14, 0)); // 12th at 14:00 UTC — inside TEMPO 12-18
    const result = getActiveTempos(taf, now);
    assert.equal(result.length, 1);
    assert.ok(result[0].includes("+TSRA"));
  });

  it("returns empty when TEMPO is not yet active", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 TEMPO 1212/1218 +TSRA FM121800 24008KT 9999";
    const now = new Date(Date.UTC(2026, 0, 12, 10, 0)); // 12th at 10:00 UTC — before TEMPO
    assert.deepEqual(getActiveTempos(taf, now), []);
  });

  it("returns empty when TEMPO has ended", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 TEMPO 1212/1218 +TSRA FM121800 24008KT 9999";
    const now = new Date(Date.UTC(2026, 0, 12, 19, 0)); // 12th at 19:00 UTC — after TEMPO
    assert.deepEqual(getActiveTempos(taf, now), []);
  });

  it("returns BECMG weather when in transition window", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 BECMG 1215/1218 24008KT";
    const now = new Date(Date.UTC(2026, 0, 12, 16, 0)); // 12th at 16:00 — inside BECMG 15-18
    const result = getActiveTempos(taf, now);
    assert.equal(result.length, 1);
    assert.ok(result[0].includes("24008KT"));
  });

  it("returns multiple active TEMPO groups", () => {
    const taf = "TAF LTFH 1206/1224 18012KT 9999 TEMPO 1206/1212 +RA TEMPO 1212/1218 +TSRA";
    const now = new Date(Date.UTC(2026, 0, 12, 8, 0)); // 12th at 08:00 — inside first TEMPO
    const result = getActiveTempos(taf, now);
    assert.equal(result.length, 1);
    assert.ok(result[0].includes("+RA"));
  });
});

// ── hasWxExtreme ───────────────────────────────────────────────────────────

describe("hasWxExtreme", () => {
  it("returns true for +TSRA", () => {
    assert.equal(hasWxExtreme("TEMPO 1212/1218 +TSRA"), true);
  });

  it("returns true for +SN", () => {
    assert.equal(hasWxExtreme("1212/1218 -SN 0200"), true);
  });

  it("returns false for normal weather", () => {
    assert.equal(hasWxExtreme("18012KT 9999 BKN030"), false);
  });

  it("returns true for FZRA", () => {
    assert.equal(hasWxExtreme("1212/1218 FZRA 0400"), true);
  });

  it("returns true for BLSN", () => {
    assert.equal(hasWxExtreme("1212/1218 BLSN 0200"), true);
  });
});

// ── hasWindExtreme ─────────────────────────────────────────────────────────

describe("hasWindExtreme", () => {
  it("returns true for wind >= 25 KT", () => {
    assert.equal(hasWindExtreme("27025KT 9999"), true);
  });

  it("returns true for gust >= 29 KT", () => {
    assert.equal(hasWindExtreme("27018G35KT 9999"), true);
  });

  it("returns false for normal wind", () => {
    assert.equal(hasWindExtreme("27012KT 9999"), false);
  });

  it("returns true for MPS >= 13", () => {
    assert.equal(hasWindExtreme("27014MPS 9999"), true);
  });

  it("returns false for MPS < 13", () => {
    assert.equal(hasWindExtreme("27010MPS 9999"), false);
  });

  it("handles VRB wind", () => {
    assert.equal(hasWindExtreme("VRB30KT 9999"), true);
  });
});
