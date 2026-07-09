/**
 * Tests for the Teams-mode join-code generator/validator (pure functions).
 * Run with: npx tsx src/lib/teamCode.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateTeamCode, normalizeTeamCode, isValidTeamCode, TEAM_CODE_LENGTH } from "./teamCode.ts";

describe("generateTeamCode", () => {
  it("generates a code of the expected length", () => {
    assert.equal(generateTeamCode().length, TEAM_CODE_LENGTH);
  });

  it("only uses uppercase letters and digits, excluding ambiguous O/0/I/1", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateTeamCode();
      assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
    }
  });

  it("produces a spread of distinct codes across many generations", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateTeamCode()));
    // With a ~1M-symbol keyspace, 500 draws should essentially never collide —
    // a low unique count here would indicate a broken RNG/charset, not bad luck.
    assert.ok(codes.size > 490, `expected mostly-unique codes, got ${codes.size}/500 unique`);
  });
});

describe("normalizeTeamCode", () => {
  it("trims whitespace and uppercases", () => {
    assert.equal(normalizeTeamCode("  ab12  "), "AB12");
  });

  it("uppercases an already-clean code", () => {
    assert.equal(normalizeTeamCode("wxyz"), "WXYZ");
  });
});

describe("isValidTeamCode", () => {
  it("accepts a well-formed generated code", () => {
    assert.equal(isValidTeamCode(generateTeamCode()), true);
  });

  it("rejects codes of the wrong length", () => {
    assert.equal(isValidTeamCode("AB1"), false);
    assert.equal(isValidTeamCode("AB123"), false);
    assert.equal(isValidTeamCode(""), false);
  });

  it("rejects ambiguous characters even at the right length", () => {
    assert.equal(isValidTeamCode("AB0I"), false); // 0 and I are excluded from the charset
  });

  it("rejects lowercase (normalize first, then validate)", () => {
    assert.equal(isValidTeamCode("ab23"), false);
  });
});
