export function normalizeIcao(raw: string): string {
  return raw
    .replace(/[İ]/g, "I")
    .replace(/[ı]/g, "I")
    .replace(/[Ş]/g, "S")
    .replace(/[ş]/g, "S")
    .replace(/[Ğ]/g, "G")
    .replace(/[ğ]/g, "G")
    .replace(/[Ü]/g, "U")
    .replace(/[ü]/g, "U")
    .replace(/[Ö]/g, "O")
    .replace(/[ö]/g, "O")
    .replace(/[Ç]/g, "C")
    .replace(/[ç]/g, "C")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}
