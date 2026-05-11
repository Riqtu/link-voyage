import type { ReceiptDetail } from "./types";

/** Сохранить порции на сервер через столько мс после последнего набора в поле */
export const QTY_COMMIT_DEBOUNCE_MS = 480;

/** Одна единица в чеке — достаточно да/нет вместо поля количества */
export function isSingleQuantityLine(qty: number): boolean {
  return Number.isFinite(qty) && qty > 0 && Math.abs(qty - 1) < 1e-3;
}

export function cloneReceipt(d: ReceiptDetail): ReceiptDetail {
  return {
    ...d,
    lineItems: d.lineItems.map((l) => ({
      ...l,
      participantUserIds: [...l.participantUserIds],
      consumptions: l.consumptions.map((c) => ({ ...c })),
    })),
    reimbursedPayerUserIds: [...d.reimbursedPayerUserIds],
  };
}
