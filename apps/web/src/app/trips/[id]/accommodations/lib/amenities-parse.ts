export function parseAmenitiesFromInput(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}
