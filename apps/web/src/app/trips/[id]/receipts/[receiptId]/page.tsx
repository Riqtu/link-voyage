"use client";

import { ReceiptImageModal } from "./components/image-modal";
import { ReceiptDetailToolbar } from "./components/receipt-detail-toolbar";
import { ReceiptLineItemsSection } from "./components/receipt-line-items-section";
import { ReceiptPhotoCard } from "./components/receipt-photo-card";
import { ReceiptTitleCard } from "./components/receipt-title-card";
import { useReceiptDetailPage } from "./hooks/use-receipt-detail-page";

export default function ReceiptDetailPage() {
  const r = useReceiptDetailPage();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <ReceiptDetailToolbar
        tripId={r.tripId}
        removeBusy={r.removeBusy}
        loading={r.loading}
        onRemoveReceipt={r.removeReceipt}
      />

      {r.error ? (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {r.error}
        </p>
      ) : null}

      {r.refreshing && r.data ? (
        <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
          Обновляем данные…
        </p>
      ) : null}

      {r.loading && !r.data ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : r.data ? (
        <>
          <ReceiptTitleCard
            data={r.data}
            viewerCanManageReceipt={r.viewerCanManageReceipt}
            payerSaving={r.payerSaving}
            refreshing={r.refreshing}
            onChangePaidByUser={r.changePaidByUser}
          />

          <ReceiptPhotoCard
            imageUrl={r.data.imageUrl}
            uploadBusy={r.uploadBusy}
            analyzeBusy={r.analyzeBusy}
            fileRef={r.fileRef}
            onPickPhoto={r.onPickPhoto}
            onAnalyze={r.runAnalyze}
            photoModalOpen={r.photoModalOpen}
            onOpenModal={() => r.setPhotoModalOpen(true)}
          />

          <ReceiptLineItemsSection
            data={r.data}
            shouldShowRubInfo={r.shouldShowRubInfo}
            canConvertToRub={r.canConvertToRub}
            currencyCode={r.currencyCode}
            rubQuoteDate={r.rubQuoteDate}
            savingLineItemId={r.savingLineItemId}
            viewerCanManageReceipt={r.viewerCanManageReceipt}
            qtyCommitTimersRef={r.qtyCommitTimersRef}
            viewerShare={r.viewerShare}
            viewerMarkedLinesCount={r.viewerMarkedLinesCount}
            receiptLinesTotal={r.receiptLinesTotal}
            reimbursedBusy={r.reimbursedBusy}
            refreshing={r.refreshing}
            addParticipantBusy={r.addParticipantBusy}
            removeParticipantUserId={r.removeParticipantUserId}
            commitLineConsumption={r.commitLineConsumption}
            toggleSinglePortion={r.toggleSinglePortion}
            toggleReimbursed={r.toggleReimbursed}
            addExternalParticipant={r.addExternalParticipant}
            removeExternalParticipant={r.removeExternalParticipant}
            toRub={r.toRub}
          />
        </>
      ) : !r.loading ? (
        <p className="text-sm text-muted-foreground">Чек не загружен.</p>
      ) : null}

      <ReceiptImageModal
        open={r.photoModalOpen}
        imageUrl={r.data?.imageUrl}
        onClose={r.closePhotoModal}
      />
    </main>
  );
}
