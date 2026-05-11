"use client";

import { LV_DATA_LOADED_ENTER_CLASS } from "@/lib/lv-motion";
import { cn } from "@/lib/utils";
import { ChecklistBottomComposer } from "./components/bottom-composer";
import { ChecklistListSwitch } from "./components/list-switch";
import { ChecklistLoadingSkeleton } from "./components/loading-skeleton";
import { ChecklistPageHeader } from "./components/page-header";
import { ChecklistPersonalHintBanner } from "./components/personal-hint";
import { ChecklistProgressBlock } from "./components/progress-block";
import { ChecklistUndoToast } from "./components/undo-toast";
import { useTripPackChecklistPage } from "./hooks/use-trip-pack-checklist-page";
import type { PackItemView } from "./lib/pack-layout";

export default function TripPackChecklistPage() {
  const cl = useTripPackChecklistPage();

  return (
    <main
      className={cn(
        "mx-auto min-h-screen w-full max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10",
        cl.isLoading
          ? "pb-12"
          : cl.undoDeleteSnapshot
            ? "pb-[calc(188px+var(--lv-trip-tab-recess,0px))] sm:pb-[calc(180px+var(--lv-trip-tab-recess,0px))]"
            : "pb-[calc(132px+var(--lv-trip-tab-recess,0px))] sm:pb-[calc(128px+var(--lv-trip-tab-recess,0px))]",
      )}
    >
      <ChecklistPageHeader
        tripTitle={cl.tripTitle}
        hintResolved={cl.hintResolved}
        personalHintVisible={cl.personalHintVisible}
        isLoading={cl.isLoading}
        resettingPreset={cl.resettingPreset}
        onResetFromPreset={cl.resetFromPreset}
      />

      {cl.loadError ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {cl.loadError}
        </p>
      ) : null}

      {!cl.isLoading && cl.hintResolved && cl.personalHintVisible ? (
        <ChecklistPersonalHintBanner onDismiss={cl.dismissPersonalHint} />
      ) : null}

      {cl.isLoading ? (
        <ChecklistLoadingSkeleton />
      ) : (
        <div className={LV_DATA_LOADED_ENTER_CLASS}>
          <ChecklistProgressBlock
            doneLines={cl.doneLines}
            lineRowsLength={cl.lineRows.length}
            bulkWorking={cl.bulkWorking}
            itemCount={cl.items.length}
            filterQuery={cl.filterQuery}
            onFilterQueryChange={cl.setFilterQuery}
            onBulkAll={() => void cl.bulkSetLinesDone(true, "all_lines")}
            onBulkClear={() => void cl.bulkSetLinesDone(false, "all_lines")}
          />

          <ChecklistListSwitch
            itemCount={cl.items.length}
            filtering={cl.filtering}
            visibleRowsLength={cl.visibleRows.length}
            items={cl.items as PackItemView[]}
            collapsedSectionIds={cl.collapsedSectionIds}
            checklistDndActions={cl.checklistDndActions}
            onReorderPeers={cl.reorderPeers}
            filteredListProps={cl.filteredListProps}
          />
        </div>
      )}

      {!cl.isLoading ? (
        <ChecklistUndoToast
          snapshot={cl.undoDeleteSnapshot}
          onRestore={cl.restoreDeletedSnapshot}
          onDismiss={() => cl.setUndoDeleteSnapshot(null)}
        />
      ) : null}

      {!cl.isLoading ? (
        <ChecklistBottomComposer
          tripId={cl.tripId}
          composerShellRef={cl.composerShellRef}
          composerExtrasOpen={cl.composerExtrasOpen}
          onComposerExtrasOpenChange={cl.setComposerExtrasOpen}
          composerGlow={cl.composerGlow}
          pendingParentSectionId={cl.pendingParentSectionId}
          onClearPendingSection={() => {
            cl.setPendingParentSectionId(null);
            cl.setComposerExtrasOpen(false);
          }}
          newTitleRef={cl.newTitleRef}
          pendingSectionTitlePreview={
            cl.items.find((i) => i.id === cl.pendingParentSectionId)?.title ??
            ""
          }
          newTitle={cl.newTitle}
          onNewTitleChange={cl.setNewTitle}
          newKind={cl.newKind}
          onNewKindChange={cl.setNewKind}
          newQty={cl.newQty}
          onNewQtyChange={cl.setNewQty}
          newUnit={cl.newUnit}
          onNewUnitChange={cl.setNewUnit}
          effectiveKind={cl.effectiveKind}
          adding={cl.adding}
          onSubmit={cl.onAddRoot}
        />
      ) : null}
    </main>
  );
}
