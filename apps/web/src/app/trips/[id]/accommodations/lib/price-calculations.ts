import type { Option } from "./types";

export function calcAccommodationTotalPrice(
  item: Option,
  nights: number,
  peopleCount: number,
): number | null {
  if (item.price === null) return null;
  if (item.pricingMode === "perNight") return item.price * nights;
  if (item.pricingMode === "perPerson") return item.price * peopleCount;
  return item.price;
}

export function calcAccommodationPerPerson(
  item: Option,
  nights: number,
  peopleCount: number,
): number | null {
  const total = calcAccommodationTotalPrice(item, nights, peopleCount);
  if (total === null) return null;
  return total / Math.max(1, peopleCount);
}

/** Та же логика, что у карточки, но из черновика формы (строка цены и режим). */
export function calcComparableTotalFromFormPrice(
  priceStr: string,
  pricingMode: Option["pricingMode"],
  nights: number,
  peopleCount: number,
): number | null {
  const n = Number(priceStr);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (pricingMode === "perNight") return n * nights;
  if (pricingMode === "perPerson") return n * Math.max(1, peopleCount);
  return n;
}
