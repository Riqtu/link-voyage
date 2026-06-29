"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Check, Loader2, Trash2 } from "lucide-react";
import { formatMoney, formatRub } from "../lib/format";
import type { ReceiptDetail } from "../lib/types";

type ReceiptMembersSharePanelProps = {
  data: ReceiptDetail;
  viewerCanManageReceipt: boolean;
  reimbursedBusy: boolean;
  refreshing: boolean;
  savingLineItemId: string | null;
  addParticipantBusy: boolean;
  removeParticipantUserId: string | null;
  canConvertToRub: boolean;
  toRub: (amount: number) => number | null;
  onToggleReimbursed: (targetUserId?: string) => void | Promise<void>;
  onAddExternalParticipant: () => void | Promise<void>;
  onRemoveExternalParticipant: (userId: string) => void | Promise<void>;
};

export function ReceiptMembersSharePanel({
  data,
  viewerCanManageReceipt,
  reimbursedBusy,
  refreshing,
  savingLineItemId,
  addParticipantBusy,
  removeParticipantUserId,
  canConvertToRub,
  toRub,
  onToggleReimbursed,
  onAddExternalParticipant,
  onRemoveExternalParticipant,
}: ReceiptMembersSharePanelProps) {
  return (
    <div className="mt-8 rounded-xl border bg-muted/30 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          По участникам (только строки с указанными долями)
        </h3>
        {!viewerCanManageReceipt ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={reimbursedBusy || refreshing || Boolean(savingLineItemId)}
            className={
              data.reimbursedPayerUserIds.includes(data.viewerId)
                ? "border-emerald-600/40 bg-emerald-600/10"
                : ""
            }
            onClick={() => void onToggleReimbursed()}
          >
            {reimbursedBusy ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
            ) : null}
            {data.reimbursedPayerUserIds.includes(data.viewerId)
              ? "Снять «скинул(а)»"
              : "Я скинул(а)"}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={addParticipantBusy || refreshing}
              onClick={() => void onAddExternalParticipant()}
            >
              {addParticipantBusy ? "Добавляем…" : "Добавить участника"}
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_7rem_auto] gap-3 border-b pb-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground sm:grid">
        <span>Участник</span>
        <span className="text-right">Перевод</span>
        <span className="text-right">Доля</span>
      </div>
      <ul className="mt-2 grid text-sm">
        {data.members.map((m) => {
          const isPayer = m.userId === data.paidByUserId;
          const reimbursed = data.reimbursedPayerUserIds.includes(m.userId);
          const canToggleReimbursed =
            !isPayer && (viewerCanManageReceipt || m.userId === data.viewerId);
          return (
            <li
              key={m.userId}
              className={cn(
                "grid grid-cols-1 gap-2 border-border border-t py-2 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-center sm:gap-3",
                reimbursed && " bg-emerald-500/8 px-2  dark:bg-emerald-500/12",
              )}
            >
              <span className="font-medium">
                {m.name}
                {isPayer ? (
                  <span className="ml-1.5 font-normal text-muted-foreground text-xs">
                    (оплатил чек)
                  </span>
                ) : m.isExternal ? (
                  <>
                    <span className="ml-1.5 font-normal text-muted-foreground text-xs">
                      (вне поездки)
                    </span>
                    {viewerCanManageReceipt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="ml-1 h-6 px-1.5 text-[11px] text-muted-foreground hover:text-destructive"
                        disabled={
                          removeParticipantUserId === m.userId || refreshing
                        }
                        onClick={() =>
                          void onRemoveExternalParticipant(m.userId)
                        }
                        title="Удалить участника из чека"
                      >
                        {removeParticipantUserId === m.userId ? (
                          <Loader2
                            className="size-3.5 animate-spin"
                            aria-hidden
                          />
                        ) : (
                          <Trash2 className="size-3.5" aria-hidden />
                        )}
                      </Button>
                    ) : null}
                  </>
                ) : null}
              </span>
              <span className="text-right text-xs sm:order-none">
                {isPayer ? (
                  <span className="text-muted-foreground">—</span>
                ) : !canToggleReimbursed ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant={reimbursed ? "secondary" : "outline"}
                    disabled={
                      reimbursedBusy || refreshing || Boolean(savingLineItemId)
                    }
                    className="h-7 px-2 text-[11px]"
                    onClick={() =>
                      void onToggleReimbursed(
                        viewerCanManageReceipt ? m.userId : undefined,
                      )
                    }
                  >
                    {reimbursed ? (
                      <>
                        <Check className="size-3.5 shrink-0" aria-hidden />
                        Отмечено
                      </>
                    ) : (
                      "Отметить"
                    )}
                  </Button>
                )}
              </span>
              <span className="text-right font-medium tabular-nums">
                {formatMoney(data.shareByMember[m.userId] ?? 0, data.currency)}
                {canConvertToRub ? (
                  <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                    (≈{" "}
                    {formatRub(toRub(data.shareByMember[m.userId] ?? 0) ?? 0)})
                  </span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
