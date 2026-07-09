// Excludes visually ambiguous characters (O/0, I/1) since codes are read
// aloud/typed by hand in an ops-room setting — 32^4 ≈ 1.05M combinations.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const TEAM_CODE_LENGTH = 4;

export function generateTeamCode(): string {
  let code = "";
  for (let i = 0; i < TEAM_CODE_LENGTH; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export function normalizeTeamCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidTeamCode(code: string): boolean {
  if (code.length !== TEAM_CODE_LENGTH) return false;
  return [...code].every((c) => CODE_CHARS.includes(c));
}
