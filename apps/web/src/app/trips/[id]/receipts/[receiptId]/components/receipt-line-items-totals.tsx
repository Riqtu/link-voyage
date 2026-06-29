"use client";

import { formatMoney, formatRub } from "../lib/format";
import type { ReceiptDetail } from "../lib/types";

type ReceiptLineItemsTotalsProps = {
  data: ReceiptDetail;
  viewerShare: number;
  viewerMarkedLinesCount: number;
  receiptLinesTotal: number;
  canConvertToRub: boolean;
  toRub: (amount: number) => number | null;
};

export function ReceiptLineItemsTotals({
  data,
  viewerShare,
  viewerMarkedLinesCount,
  receiptLinesTotal,
  canConvertToRub,
  toRub,
}: ReceiptLineItemsTotalsProps) {
  return (
    <div className="mt-4 ml-auto max-w-md text-right text-xs leading-relaxed text-muted-foreground">
      Итого по чеку:{" "}
      <strong className="text-foreground">
        {formatMoney(data.totalAmount, data.currency)}
      </strong>
      {canConvertToRub ? (
        <>
          {" "}
          <span className="text-[11px]">
            (≈ {formatRub(toRub(data.totalAmount) ?? 0)})
          </span>
        </>
      ) : null}
      <br />
      Ваша сумма по строкам с долями:{" "}
      <strong className="text-primary">
        {formatMoney(viewerShare, data.currency)}
      </strong>
      {canConvertToRub ? (
        <>
          {" "}
          <span className="text-[11px] text-muted-foreground">
            (≈ {formatRub(toRub(viewerShare) ?? 0)})
          </span>
        </>
      ) : null}
      <br />
      Строк выбрано у вас:{" "}
      <strong className="tabular-nums text-foreground">
        {viewerMarkedLinesCount} из {receiptLinesTotal}
      </strong>
      {!data.anyLineSelections && data.hypotheticalShareAllEqual !== null ? (
        <>
          <br />
          <span className="mt-2 inline-block max-w-sm text-[0.72rem]">
            Пока никто ни в строке не отмечен. Если делить{" "}
            <strong className="text-foreground">весь чек поровну</strong> на
            всех {data.members.length}:{" "}
            {formatMoney(data.hypotheticalShareAllEqual, data.currency)} на
            человека.
          </span>
        </>
      ) : null}
    </div>
  );
}
