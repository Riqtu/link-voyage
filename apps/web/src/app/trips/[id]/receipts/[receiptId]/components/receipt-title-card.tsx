"use client";

import { Loader2 } from "lucide-react";
import type { ReceiptDetail } from "../lib/types";

type ReceiptTitleCardProps = {
  data: ReceiptDetail;
  viewerCanManageReceipt: boolean;
  payerSaving: boolean;
  refreshing: boolean;
  onChangePaidByUser: (userId: string) => void;
};

export function ReceiptTitleCard({
  data,
  viewerCanManageReceipt,
  payerSaving,
  refreshing,
  onChangePaidByUser,
}: ReceiptTitleCardProps) {
  return (
    <header className="rounded-2xl border bg-card p-6 shadow-sm">
      <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Оплатил:{" "}
        <strong className="text-foreground">{data.paidByUserName}</strong>
        {data.description ? (
          <>
            <br />
            {data.description}
          </>
        ) : null}
      </p>
      {viewerCanManageReceipt ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">
            Изменить оплатившего:
          </span>
          <select
            className="h-8 rounded-md border bg-background px-2 text-xs"
            value={data.paidByUserId}
            disabled={payerSaving || refreshing}
            onChange={(e) => void onChangePaidByUser(e.target.value)}
          >
            {data.members
              .filter((m) => !m.isExternal)
              .map((m) => (
                <option key={m.userId} value={m.userId}>
                  {m.name}
                </option>
              ))}
          </select>
          {payerSaving ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Сохраняем…
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
