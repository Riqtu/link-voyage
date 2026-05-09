export type ReceiptLineForShare = {
  qty: number;
  lineTotal: number;
  participantUserIds?: string[];
  consumptions?: { userId: string; qty: number }[];
};

export const RECEIPT_LINE_QTY_EPS = 1e-4;

/** Консолидирует строку: consumptions имеют приоритет, иначе старый список с поровну по qty строки */
export function effectiveConsumptionsFromLine(
  line: ReceiptLineForShare,
): { userId: string; qty: number }[] {
  const raw =
    Array.isArray(line.consumptions) &&
    line.consumptions.some((c) => Number(c.qty) > 0 && c.userId?.length > 0)
      ? line.consumptions.filter(
          (c) => typeof c.userId === 'string' && Number(c.qty) > 0,
        )
      : [];

  if (raw.length > 0) {
    const m = new Map<string, number>();
    for (const c of raw) {
      const q = Number(c.qty);
      m.set(c.userId, (m.get(c.userId) ?? 0) + q);
    }
    return [...m.entries()].map(([userId, qty]) => ({
      userId,
      qty: Math.round(qty * 1e6) / 1e6,
    }));
  }

  const pids = Array.isArray(line.participantUserIds)
    ? line.participantUserIds.filter(
        (x) => typeof x === 'string' && x.length > 0,
      )
    : [];
  if (pids.length === 0) return [];

  const n = pids.length;
  const lineQty = Math.max(Number(line.qty) || 1, 0);
  const each =
    Number.isFinite(lineQty) && n > 0
      ? Math.round((lineQty / n) * 1e6) / 1e6
      : 1 / Math.max(n, 1);
  return pids.map((userId) => ({ userId, qty: each }));
}

/** Каждая порция = lineTotal / lineQty; доля человека proportional к его qty (не к сумме набранным пока только часть линии). */
export function computeReceiptShares(
  lineItems: ReceiptLineForShare[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of lineItems) {
    const shares = effectiveConsumptionsFromLine(line);
    const lineQty = Math.max(Number(line.qty) || 0, 0);
    if (lineQty <= RECEIPT_LINE_QTY_EPS || shares.length === 0) continue;
    const total = Number(line.lineTotal);
    if (!Number.isFinite(total) || total < 0) continue;
    for (const sh of shares) {
      const q = Number(sh.qty);
      if (!(q > 0 && Number.isFinite(q))) continue;
      out[sh.userId] = (out[sh.userId] ?? 0) + total * (q / lineQty);
    }
  }
  return out;
}

export function receiptLineHasSelections(line: ReceiptLineForShare): boolean {
  return effectiveConsumptionsFromLine(line).length > 0;
}
