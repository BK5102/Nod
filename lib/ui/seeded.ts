/** How a seeded invoice was made, in words for the SEEDED label. */
export function seededLabel(extractionMethod: string): string | null {
  if (extractionMethod === "seed-public") return "SEEDED, amount modeled on SF public vendor payments (FY2025)";
  if (extractionMethod === "seed-generated") return "SEEDED, GENERATED amounts";
  if (extractionMethod === "seed") return "SEEDED";
  return null;
}
