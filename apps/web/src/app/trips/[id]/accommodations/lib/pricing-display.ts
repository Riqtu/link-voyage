import type { Option } from "./types";

export function getPricingModeLabel(mode: Option["pricingMode"]): string {
  if (mode === "perNight") return "за ночь";
  if (mode === "perPerson") return "за человека";
  return "за период";
}

export function getPricingModeHint(mode: Option["pricingMode"]): string {
  if (mode === "perNight") return "Цена рассчитывается за ночь";
  if (mode === "perPerson") return "Цена рассчитывается за человека";
  return "Цена рассчитывается за весь период";
}
