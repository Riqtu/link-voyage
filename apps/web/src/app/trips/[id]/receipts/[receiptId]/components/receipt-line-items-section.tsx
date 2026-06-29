"use client";

import type { MutableRefObject } from "react";
import type { ReceiptDetail } from "../lib/types";
import { ReceiptLineItemsTotals } from "./receipt-line-items-totals";
import { ReceiptLinesTable } from "./receipt-lines-table";
import { ReceiptMembersSharePanel } from "./receipt-members-share-panel";
import { ReceiptRubNote } from "./receipt-rub-note";

type ReceiptLineItemsSectionProps = {
  data: ReceiptDetail;
  shouldShowRubInfo: boolean;
  canConvertToRub: boolean;
  currencyCode: string;
  rubQuoteDate: string | null;
  savingLineItemId: string | null;
  viewerCanManageReceipt: boolean;
  qtyCommitTimersRef: MutableRefObject<Partial<Record<string, number>>>;
  viewerShare: number;
  viewerMarkedLinesCount: number;
  receiptLinesTotal: number;
  reimbursedBusy: boolean;
  refreshing: boolean;
  addParticipantBusy: boolean;
  removeParticipantUserId: string | null;
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
  toggleReimbursed: (targetUserId?: string) => void | Promise<void>;
  addExternalParticipant: () => void | Promise<void>;
  removeExternalParticipant: (userId: string) => void | Promise<void>;
  toRub: (amount: number) => number | null;
};

export function ReceiptLineItemsSection(props: ReceiptLineItemsSectionProps) {
  const {
    data,
    shouldShowRubInfo,
    canConvertToRub,
    currencyCode,
    rubQuoteDate,
    savingLineItemId,
    viewerCanManageReceipt,
    qtyCommitTimersRef,
    viewerShare,
    viewerMarkedLinesCount,
    receiptLinesTotal,
    reimbursedBusy,
    refreshing,
    addParticipantBusy,
    removeParticipantUserId,
    commitLineConsumption,
    toggleSinglePortion,
    toggleReimbursed,
    addExternalParticipant,
    removeExternalParticipant,
    toRub,
  } = props;

  return (
    <section className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold">Позиции и ваш выбор</h2>

      <ReceiptRubNote
        shouldShow={shouldShowRubInfo}
        canConvert={canConvertToRub}
        currencyCode={currencyCode}
        rubQuoteDate={rubQuoteDate}
      />

      {data.lineItems.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Позиций пока нет — загрузите фото и нажмите «Разобрать с Gemini».
        </p>
      ) : (
        <>
          <ReceiptLinesTable
            data={data}
            savingLineItemId={savingLineItemId}
            viewerCanManageReceipt={viewerCanManageReceipt}
            qtyCommitTimersRef={qtyCommitTimersRef}
            commitLineConsumption={commitLineConsumption}
            toggleSinglePortion={toggleSinglePortion}
            canConvertToRub={canConvertToRub}
            toRub={toRub}
          />
          <ReceiptLineItemsTotals
            data={data}
            viewerShare={viewerShare}
            viewerMarkedLinesCount={viewerMarkedLinesCount}
            receiptLinesTotal={receiptLinesTotal}
            canConvertToRub={canConvertToRub}
            toRub={toRub}
          />
        </>
      )}

      <ReceiptMembersSharePanel
        data={data}
        viewerCanManageReceipt={viewerCanManageReceipt}
        reimbursedBusy={reimbursedBusy}
        refreshing={refreshing}
        savingLineItemId={savingLineItemId}
        addParticipantBusy={addParticipantBusy}
        removeParticipantUserId={removeParticipantUserId}
        canConvertToRub={canConvertToRub}
        toRub={toRub}
        onToggleReimbursed={toggleReimbursed}
        onAddExternalParticipant={addExternalParticipant}
        onRemoveExternalParticipant={removeExternalParticipant}
      />
    </section>
  );
}
