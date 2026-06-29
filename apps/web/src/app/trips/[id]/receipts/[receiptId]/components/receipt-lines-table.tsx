"use client";

import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { MutableRefObject } from "react";
import { formatMoney, formatRub } from "../lib/format";
import {
  isSingleQuantityLine,
  QTY_COMMIT_DEBOUNCE_MS,
  viewerQtyOnLine,
} from "../lib/receipt-helpers";
import type { ReceiptDetail } from "../lib/types";

type ReceiptLinesTableProps = {
  data: ReceiptDetail;
  savingLineItemId: string | null;
  viewerCanManageReceipt: boolean;
  qtyCommitTimersRef: MutableRefObject<Partial<Record<string, number>>>;
  commitLineConsumption: (
    lineItemId: string,
    lineQty: number,
    raw: string,
    viewerId: string,
    targetUserId?: string,
  ) => void | Promise<void>;
  toggleSinglePortion: (
    lineItemId: string,
    lineQty: number,
    viewerId: string,
    targetUserId?: string,
  ) => void | Promise<void>;
  canConvertToRub: boolean;
  toRub: (amount: number) => number | null;
};

export function ReceiptLinesTable({
  data,
  savingLineItemId,
  viewerCanManageReceipt,
  qtyCommitTimersRef,
  commitLineConsumption,
  toggleSinglePortion,
  canConvertToRub,
  toRub,
}: ReceiptLinesTableProps) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border border-border/60 bg-card/40">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead className="border-b border-border/60 bg-muted/25">
          <tr>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Позиция
            </th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Кол-во
            </th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Цена ×1
            </th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Сумма строки
            </th>
            <th className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Порции / участие
            </th>
            <th className="hidden px-3 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:table-cell">
              Кто сколько
            </th>
          </tr>
        </thead>
        <tbody>
          {data.lineItems.map((line) => {
            const denom = line.consumedQtyTotal;
            const rowQty =
              typeof line.qty === "number" && line.qty > 0 ? line.qty : null;
            const viewerQty = viewerQtyOnLine(line, data.viewerId);
            const viewerShareApprox =
              rowQty !== null && viewerQty > 1e-9
                ? (line.lineTotal * viewerQty) / rowQty
                : null;

            const entryCount = denom > 1e-9 ? line.consumptions.length : 0;

            return (
              <tr
                key={line.id}
                className={cn(
                  "border-b border-border transition-colors",
                  savingLineItemId === line.id && "bg-muted/50",
                )}
              >
                <td className="px-3 py-2.5 align-top font-medium">
                  {line.name}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <div>{line.qty}</div>
                  {denom > 1e-9 ? (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex ">
                        <span className="tabular-nums text-foreground whitespace-nowrap">
                          {line.consumedQtyTotal}/{line.qty}
                        </span>{" "}
                      </span>
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 align-top">
                  {line.unitPrice !== undefined
                    ? formatMoney(line.unitPrice, data.currency)
                    : "—"}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <div className="font-medium">
                    {formatMoney(line.lineTotal, data.currency)}
                  </div>
                  {canConvertToRub ? (
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      ≈ {formatRub(toRub(line.lineTotal) ?? 0)}
                    </div>
                  ) : null}
                  {viewerShareApprox !== null ? (
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      вам <br /> ≈&nbsp;
                      {formatMoney(viewerShareApprox, data.currency)}
                      {canConvertToRub ? (
                        <span className="ml-1 inline-flex whitespace-nowrap">
                          (≈&nbsp;{formatRub(toRub(viewerShareApprox) ?? 0)})
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 align-middle">
                  {isSingleQuantityLine(line.qty) ? (
                    viewerCanManageReceipt ? (
                      <div className="flex max-w-[14rem] flex-wrap gap-1">
                        {data.members.map((m) => {
                          const active = viewerQtyOnLine(line, m.userId) > 1e-9;
                          return (
                            <button
                              key={`${line.id}-${m.userId}`}
                              type="button"
                              disabled={savingLineItemId === line.id}
                              className={cn(
                                "rounded-md border px-2 py-0.5 text-xs transition",
                                active
                                  ? "border-primary/40 bg-primary/10 text-foreground"
                                  : "border-border bg-background text-muted-foreground hover:bg-muted/50",
                                savingLineItemId === line.id &&
                                  "cursor-wait opacity-80",
                              )}
                              onClick={() =>
                                void toggleSinglePortion(
                                  line.id,
                                  line.qty,
                                  data.viewerId,
                                  m.userId,
                                )
                              }
                            >
                              {m.name}
                              {m.isExternal ? " • вне поездки" : ""}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2",
                          savingLineItemId === line.id &&
                            "cursor-wait opacity-90",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 rounded border"
                          checked={viewerQty > 1e-9}
                          disabled={savingLineItemId === line.id}
                          aria-busy={
                            savingLineItemId === line.id ? true : undefined
                          }
                          aria-label={`Участвую в «${line.name}»`}
                          onChange={() =>
                            void toggleSinglePortion(
                              line.id,
                              line.qty,
                              data.viewerId,
                            )
                          }
                        />
                        {savingLineItemId === line.id ? (
                          <Loader2
                            className="size-4 shrink-0 animate-spin text-muted-foreground"
                            aria-hidden
                          />
                        ) : null}
                        <span className="text-xs text-muted-foreground">
                          участвую
                        </span>
                      </label>
                    )
                  ) : (
                    <div className="flex max-w-[8rem] flex-col gap-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={line.qty}
                        step={Number.isInteger(line.qty) ? 1 : "any"}
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums"
                        defaultValue={viewerQty > 0 ? String(viewerQty) : ""}
                        key={`${line.id}-${viewerQty}-${line.consumedQtyTotal}`}
                        disabled={savingLineItemId === line.id}
                        aria-busy={
                          savingLineItemId === line.id ? true : undefined
                        }
                        aria-label={`Сколько порций «${line.name}» для вас`}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const pending = qtyCommitTimersRef.current[line.id];
                          if (pending !== undefined) clearTimeout(pending);
                          qtyCommitTimersRef.current[line.id] =
                            window.setTimeout(() => {
                              delete qtyCommitTimersRef.current[line.id];
                              void commitLineConsumption(
                                line.id,
                                line.qty,
                                raw,
                                data.viewerId,
                              );
                            }, QTY_COMMIT_DEBOUNCE_MS);
                        }}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter") return;
                          e.preventDefault();
                          e.currentTarget.blur();
                        }}
                        onBlur={(e) => {
                          const pending = qtyCommitTimersRef.current[line.id];
                          if (pending !== undefined) {
                            clearTimeout(pending);
                            delete qtyCommitTimersRef.current[line.id];
                          }
                          void commitLineConsumption(
                            line.id,
                            line.qty,
                            e.target.value,
                            data.viewerId,
                          );
                        }}
                      />
                      <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                        {savingLineItemId === line.id ? (
                          <Loader2
                            className="size-3 shrink-0 animate-spin"
                            aria-hidden
                          />
                        ) : null}
                        макс. {line.qty}
                      </span>
                    </div>
                  )}
                </td>
                <td className="hidden px-3 py-2.5 align-top text-xs md:table-cell">
                  {entryCount === 0 ? (
                    <span className="text-muted-foreground">
                      никто не указал
                    </span>
                  ) : (
                    <ul className="space-y-0.5">
                      {line.consumptions.map((c) => (
                        <li key={c.userId}>
                          {data.members.find((m) => m.userId === c.userId)
                            ?.name ?? c.userId.slice(0, 6)}
                          :{" "}
                          <span className="tabular-nums font-medium">
                            {c.qty}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
