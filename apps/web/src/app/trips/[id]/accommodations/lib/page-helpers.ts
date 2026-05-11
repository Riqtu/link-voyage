import type { ModalCurrency } from "./types";

export function escapePrintHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function formatAmount(value: number, currency: string) {
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export function formatRubAmount(value: number): string {
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

export function isUsdCurrency(code: string): boolean {
  return code.trim().toUpperCase() === "USD";
}

export function closeNearestDetailsMenu(trigger: HTMLElement) {
  trigger.closest("details")?.removeAttribute("open");
}

/**
 * Ночи по UTC-календарным датам из ISO (как при сохранении настроек поездки).
 * Если даты сохранены в обратном порядке (конец раньше начала), считаем интервал
 * между ранней и поздней датой — чтобы «за человека» и per-night не падали в 1 ночь.
 */
export function tripNightsFromIsoRange(
  startIso: string | null,
  endIso: string | null,
): number {
  const s = startIso?.slice(0, 10);
  const e = endIso?.slice(0, 10);
  if (!s || !e) return 1;
  const parseYmd = (ymd: string) => {
    const parts = ymd.split("-").map((x) => Number.parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
      return NaN;
    }
    const [y, m, d] = parts;
    return Date.UTC(y, m - 1, d);
  };
  let t0 = parseYmd(s);
  let t1 = parseYmd(e);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return 1;
  if (t1 < t0) {
    const tmp = t0;
    t0 = t1;
    t1 = tmp;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((t1 - t0) / dayMs);
  if (!Number.isFinite(diffDays) || diffDays < 1) return 1;
  return diffDays;
}

export function normalizeModalCurrency(raw: string | undefined): ModalCurrency {
  const code = (raw ?? "").trim().toUpperCase();
  if (code === "RUB" || code === "EUR" || code === "USD") return code;
  return "USD";
}

/** Ряд карта / голосование / источник: одинаковая высота и ширина ячейки на десктопе */
export const lodgingQuickToolbarBtnClass =
  "flex h-9 min-h-[2.25rem] flex-1 items-center justify-center md:size-9 md:min-h-9 md:flex-none [&_svg]:pointer-events-none";
