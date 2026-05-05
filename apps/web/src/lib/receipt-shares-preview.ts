/**
 * Тот же расчёт долей, что на API (tripReceipt.byId / computeReceiptShares),
 * чтобы оптимистично подставлять shareByMember до ответа сервера.
 */
const RECEIPT_LINE_QTY_EPS = 1e-4;

export type ShareLinePreview = {
  qty: number;
  lineTotal: number;
  participantUserIds?: string[];
  consumptions?: { userId: string; qty: number }[];
};

function effectiveConsumptionsFromLine(
  line: ShareLinePreview,
): { userId: string; qty: number }[] {
  const raw =
    Array.isArray(line.consumptions) &&
    line.consumptions.some((c) => Number(c.qty) > 0 && c.userId?.length > 0)
      ? line.consumptions.filter(
          (c) => typeof c.userId === "string" && Number(c.qty) > 0,
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
        (x) => typeof x === "string" && x.length > 0,
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

export function receiptLineHasSelectionsPreview(
  line: ShareLinePreview,
): boolean {
  return effectiveConsumptionsFromLine(line).length > 0;
}

export function computeReceiptSharesPreview(
  lineItems: ShareLinePreview[],
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

function lineItemToPreview(line: {
  qty: number;
  lineTotal: number;
  participantUserIds: string[];
  consumptions: { userId: string; qty: number }[];
}): ShareLinePreview {
  return {
    qty: line.qty,
    lineTotal: line.lineTotal,
    participantUserIds:
      line.participantUserIds.length > 0 ? line.participantUserIds : [],
    consumptions: line.consumptions.length > 0 ? line.consumptions : undefined,
  };
}

/** Оптимистично поменять долю пользователя по строке и пересчитать агрегаты. */
export function patchConsumptionOptimistic<
  R extends {
    lineItems: {
      id: string;
      qty: number;
      lineTotal: number;
      participantUserIds: string[];
      consumptions: { userId: string; qty: number }[];
      consumedQtyTotal?: number;
    }[];
    members: { userId: string }[];
    totalAmount?: number;
    anyLineSelections: boolean;
    hypotheticalShareAllEqual: number | null;
    shareByMember: Record<string, number>;
  },
>(draft: R, lineItemId: string, viewerId: string, newQty: number): R {
  const q = Number(newQty);
  const safeQty = !Number.isFinite(q) || q < 0 ? 0 : q;

  const lineItems = draft.lineItems.map((line) => {
    if (line.id !== lineItemId) return { ...line };
    let nextQ = Math.min(safeQty, Math.max(Number(line.qty) || 0, 0));
    nextQ = Math.round(nextQ * 1e6) / 1e6;

    const others = line.consumptions.filter((c) => c.userId !== viewerId);
    const consumptions =
      nextQ > 1e-9
        ? [...others, { userId: viewerId, qty: nextQ }]
        : [...others];

    const m = new Map<string, number>();
    for (const c of consumptions) {
      m.set(c.userId, Math.round(((m.get(c.userId) ?? 0) + c.qty) * 1e6) / 1e6);
    }
    const merged = [...m.entries()].map(([userId, qty]) => ({ userId, qty }));
    const consumedQtyTotal =
      Math.round(
        merged.reduce((s, c) => s + c.qty, 0) * 1000 + Number.EPSILON,
      ) / 1000;

    return {
      ...line,
      participantUserIds: [],
      consumptions: merged,
      consumedQtyTotal,
    };
  });

  const shareInputs = lineItems.map((ln) =>
    lineItemToPreview({
      qty: ln.qty,
      lineTotal: ln.lineTotal,
      participantUserIds: ln.participantUserIds,
      consumptions: ln.consumptions,
    }),
  );
  const shareByMember = computeReceiptSharesPreview(shareInputs);
  const anyLineSelections = shareInputs.some((ln) =>
    receiptLineHasSelectionsPreview(ln),
  );
  const totalAmount = lineItems.reduce((s, ln) => s + ln.lineTotal, 0);
  const hypotheticalShareAllEqual =
    !anyLineSelections && draft.members.length > 0 && totalAmount > 0
      ? totalAmount / draft.members.length
      : null;

  return {
    ...draft,
    lineItems,
    shareByMember,
    anyLineSelections,
    hypotheticalShareAllEqual,
  };
}

export function patchReimbursedOptimistic<
  R extends { reimbursedPayerUserIds: string[] },
>(draft: R, viewerId: string): R {
  const has = draft.reimbursedPayerUserIds.includes(viewerId);
  const reimbursedPayerUserIds = has
    ? draft.reimbursedPayerUserIds.filter((id) => id !== viewerId)
    : [...draft.reimbursedPayerUserIds, viewerId];
  return { ...draft, reimbursedPayerUserIds };
}
