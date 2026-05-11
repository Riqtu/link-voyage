"use client";

import { useParams, useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import type { ChecklistDndActions } from "../components/dnd-list";
import type { ChecklistFilteredListProps } from "../components/filtered-list";
import { CHECKLIST_PERSONAL_HINT_KEY } from "../lib/constants";
import { type PackItemView } from "../lib/pack-layout";
import { collapseStorageKeyForTrip } from "../lib/page-helpers";
import {
  packLineCountBySectionId,
  packVisibleRowsFiltered,
} from "../lib/trip-pack-checklist-derived";
import { buildTripPackChecklistWidgetProps } from "../lib/trip-pack-checklist-widget-props";
import { useTripPackChecklistEffects } from "./use-trip-pack-checklist-effects";
import {
  type BulkWorkingKey,
  useTripPackChecklistMutations,
} from "./use-trip-pack-checklist-mutations";

export function useTripPackChecklistPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const router = useRouter();
  const newTitleRef = useRef<HTMLInputElement>(null);
  const composerShellRef = useRef<HTMLDivElement>(null);
  const [tripTitle, setTripTitle] = useState<string | null>(null);
  const [items, setItems] = useState<PackItemView[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<"line" | "group">("line");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [adding, setAdding] = useState(false);
  const [pendingParentSectionId, setPendingParentSectionId] = useState<
    string | null
  >(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraftTitle, setEditDraftTitle] = useState("");
  const [editDraftQty, setEditDraftQty] = useState("");
  const [editDraftUnit, setEditDraftUnit] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [resettingPreset, setResettingPreset] = useState(false);

  const [composerExtrasOpen, setComposerExtrasOpen] = useState(false);
  const [composerGlow, setComposerGlow] = useState(false);

  const [hintResolved, setHintResolved] = useState(false);
  const [personalHintVisible, setPersonalHintVisible] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const [filterQuery, setFilterQuery] = useState("");
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(
    () => {
      try {
        if (typeof window === "undefined") return new Set();
        const raw = window.localStorage.getItem(
          collapseStorageKeyForTrip(tripId),
        );
        if (!raw) return new Set();
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(
          parsed.filter((x): x is string => typeof x === "string"),
        );
      } catch {
        return new Set();
      }
    },
  );
  const [undoDeleteSnapshot, setUndoDeleteSnapshot] = useState<
    PackItemView[] | null
  >(null);
  const undoTimerRef = useRef<number | null>(null);
  const [bulkWorking, setBulkWorking] = useState<BulkWorkingKey>(null);

  const filterNorm = filterQuery.trim().toLowerCase();
  const filtering = filterNorm.length > 0;

  const collapseKey = useMemo(
    () => collapseStorageKeyForTrip(tripId),
    [tripId],
  );

  function toggleSectionCollapsed(sectionId: string) {
    setCollapsedSectionIds((prev) => {
      const n = new Set(prev);
      if (n.has(sectionId)) n.delete(sectionId);
      else n.add(sectionId);
      return n;
    });
  }

  const visibleRows = useMemo(
    () =>
      packVisibleRowsFiltered(items, {
        collapsedSectionIds,
        filterNorm,
      }),
    [items, collapsedSectionIds, filterNorm],
  );

  const lineRows = useMemo(
    () => items.filter((i) => i.kind === "line"),
    [items],
  );

  const lineCountBySectionId = useMemo(
    () => packLineCountBySectionId(items),
    [items],
  );

  const {
    load,
    onAddRoot,
    duplicateLine,
    toggleDone,
    beginEdit,
    saveEdit,
    resetFromPreset,
    removeRow,
    restoreDeletedSnapshot,
    reorderPeers,
    bulkSetLinesDone,
  } = useTripPackChecklistMutations({
    tripId,
    router,
    newTitleRef,
    items,
    setItems,
    setLoadError,
    setTripTitle,
    setIsLoading,
    pendingParentSectionId,
    editingId,
    newTitle,
    setNewTitle,
    newKind,
    newQty,
    setNewQty,
    newUnit,
    setNewUnit,
    setAdding,
    setPendingParentSectionId,
    setComposerExtrasOpen,
    editDraftTitle,
    editDraftQty,
    editDraftUnit,
    setEditDraftTitle,
    setEditDraftQty,
    setEditDraftUnit,
    setEditingId,
    setEditSaving,
    setDuplicatingId,
    setTogglingId,
    setRemovingId,
    setResettingPreset,
    setCollapsedSectionIds,
    undoDeleteSnapshot,
    setUndoDeleteSnapshot,
    setBulkWorking,
  });

  useTripPackChecklistEffects({
    collapseKey,
    collapsedSectionIds,
    undoDeleteSnapshot,
    setUndoDeleteSnapshot,
    undoTimerRef,
    composerGlow,
    setComposerGlow,
    composerShellRef,
    composerExtrasOpen,
    setComposerExtrasOpen,
    load,
    setHintResolved,
    setPersonalHintVisible,
  });

  function dismissPersonalHint() {
    try {
      window.localStorage.setItem(CHECKLIST_PERSONAL_HINT_KEY, "1");
    } catch {
      /* ignore quota */
    }
    setPersonalHintVisible(false);
  }

  const doneLines = lineRows.filter((r) => r.done).length;
  const effectiveKind = pendingParentSectionId ? "line" : newKind;

  const checklistWidgetBase = buildTripPackChecklistWidgetProps({
    tripId,
    items,
    visibleRows,
    collapsedSectionIds,
    lineCountBySectionId,
    editingId,
    editDraftTitle,
    editDraftQty,
    editDraftUnit,
    editSaving,
    setEditDraftTitle,
    setEditDraftQty,
    setEditDraftUnit,
    setEditingId,
    beginEdit,
    saveEdit,
    togglingId,
    removingId,
    duplicatingId,
    toggleDone,
    duplicateLine,
    removeRow,
    bulkSetLinesDone,
    toggleSectionCollapsed,
    pendingParentSectionId,
    setPendingParentSectionId,
    setComposerGlow,
    bulkWorking,
  });
  const checklistDndActions: ChecklistDndActions = {
    ...checklistWidgetBase.checklistDndActions,
    newTitleRef,
  };
  const filteredListProps: ChecklistFilteredListProps = {
    ...checklistWidgetBase.filteredListProps,
    newTitleRef,
  };

  return {
    tripId,
    newTitleRef,
    composerShellRef,
    tripTitle,
    items,
    loadError,
    isLoading,
    newTitle,
    setNewTitle,
    newKind,
    setNewKind,
    newQty,
    setNewQty,
    newUnit,
    setNewUnit,
    adding,
    pendingParentSectionId,
    setPendingParentSectionId,
    editingId,
    editDraftTitle,
    editDraftQty,
    editDraftUnit,
    editSaving,
    removingId,
    togglingId,
    resettingPreset,
    composerExtrasOpen,
    setComposerExtrasOpen,
    composerGlow,
    hintResolved,
    personalHintVisible,
    duplicatingId,
    filterQuery,
    setFilterQuery,
    collapsedSectionIds,
    undoDeleteSnapshot,
    setUndoDeleteSnapshot,
    bulkWorking,
    filtering,
    visibleRows,
    lineRows,
    doneLines,
    effectiveKind,
    checklistDndActions,
    filteredListProps,
    onAddRoot,
    dismissPersonalHint,
    resetFromPreset,
    restoreDeletedSnapshot,
    reorderPeers,
    bulkSetLinesDone,
  };
}
