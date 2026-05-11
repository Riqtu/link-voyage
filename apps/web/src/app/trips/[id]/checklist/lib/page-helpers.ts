import type { PackItemView } from "./pack-layout";

export function collapseStorageKeyForTrip(tripId: string): string {
  return `lv-checklist-collapsed-${tripId}`;
}

export type RestorePackOrdered = (
  | { kind: "group"; clientKey: string; title: string }
  | {
      kind: "line";
      clientKey: string;
      parentClientKey?: string;
      title: string;
      done?: boolean;
      quantity?: number | null;
      quantityUnit?: string | null;
    }
)[];

export function buildRestorePayloadFromSnapshot(
  snapshot: PackItemView[],
): RestorePackOrdered {
  return snapshot.map((r) =>
    r.kind === "group"
      ? { kind: "group" as const, clientKey: r.id, title: r.title }
      : {
          kind: "line" as const,
          clientKey: r.id,
          ...(r.parentItemId ? { parentClientKey: r.parentItemId } : {}),
          title: r.title,
          done: r.done,
          ...(typeof r.quantity === "number"
            ? {
                quantity: r.quantity,
                quantityUnit: r.quantityUnit ?? null,
              }
            : {}),
        },
  );
}

/**
 * Если в названии в конце «— 5 шт» / « · 3 пары » — выделяем число и единицу.
 * Явные поля количества в форме важнее; срабатывает только без ввода числа там.
 */
export function parseTitleTrailingQty(raw: string): {
  cleanTitle: string;
  quantity?: number;
  quantityUnit?: string;
} {
  const full = raw.trim();
  const patterns = [
    /^([\s\S]{1,400}?)[\u00a0\s]+[—–·][\u00a0\s]*(\d{1,5})(?:[\u00a0\s]+(шт\.?|пар(?:ы|а)?\.?|уп\.?|компл\.?))?[\s\u00a0]*$/iu,
    /^([\s\S]{1,400}?)[\u00a0\s]+[\-–][\u00a0\s]+(\d{1,5})(?:[\u00a0\s]+(шт\.?|пар(?:ы|а)?\.?|уп\.?|компл\.?))?[\s\u00a0]*$/iu,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(full);
    if (!m) continue;
    const titlePart = (m[1] ?? "").trim();
    const n = Number.parseInt((m[2] ?? "").trim(), 10);
    if (titlePart.length < 1) continue;
    if (!Number.isFinite(n) || n < 1 || n > 99999) continue;
    const rawU = (m[3] ?? "").replace(/\./g, "").trim().toLowerCase();
    let unit: string | undefined;
    if (rawU.startsWith("пар")) unit = "пар";
    else if (rawU.startsWith("шт")) unit = "шт";
    else if (rawU.startsWith("уп")) unit = "уп.";
    else if (rawU.startsWith("компл")) unit = "компл";

    const quantityUnit =
      unit && unit.length > 0 && unit.length <= 12 ? unit : undefined;

    return { cleanTitle: titlePart, quantity: n, quantityUnit };
  }
  return { cleanTitle: full };
}

export function qtyLabel(row: PackItemView): string | null {
  if (row.kind !== "line" || row.quantity == null) return null;
  const u = row.quantityUnit?.trim();
  return u ? `${row.quantity}\u00a0${u}` : `${row.quantity}`;
}

export function parseQty(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 1 && n <= 99999 ? n : undefined;
}

export function focusComposerTitle(input: HTMLInputElement | null) {
  if (!input) return;
  queueMicrotask(() => input.focus({ preventScroll: true }));
}
