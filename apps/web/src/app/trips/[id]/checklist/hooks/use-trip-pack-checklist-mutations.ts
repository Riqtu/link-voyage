"use client";

import type { useRouter } from "next/navigation";
import {
  type Dispatch,
  type FormEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import {
  collectDescendantPackIds,
  type PackItemView,
} from "../lib/pack-layout";
import {
  buildRestorePayloadFromSnapshot,
  focusComposerTitle,
  parseQty,
  parseTitleTrailingQty,
} from "../lib/page-helpers";
import * as remote from "../lib/trip-pack-checklist-remote";
import {
  type BulkWorkingKey,
  useTripPackChecklistSync,
} from "./use-trip-pack-checklist-sync";

export type { BulkWorkingKey } from "./use-trip-pack-checklist-sync";

export type UseTripPackChecklistMutationsArgs = {
  tripId: string;
  router: ReturnType<typeof useRouter>;
  newTitleRef: RefObject<HTMLInputElement | null>;
  items: PackItemView[];
  setItems: Dispatch<SetStateAction<PackItemView[]>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setTripTitle: Dispatch<SetStateAction<string | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  pendingParentSectionId: string | null;
  editingId: string | null;
  newTitle: string;
  setNewTitle: Dispatch<SetStateAction<string>>;
  newKind: "line" | "group";
  newQty: string;
  setNewQty: Dispatch<SetStateAction<string>>;
  newUnit: string;
  setNewUnit: Dispatch<SetStateAction<string>>;
  setAdding: Dispatch<SetStateAction<boolean>>;
  setPendingParentSectionId: Dispatch<SetStateAction<string | null>>;
  setComposerExtrasOpen: Dispatch<SetStateAction<boolean>>;
  editDraftTitle: string;
  editDraftQty: string;
  editDraftUnit: string;
  setEditDraftTitle: Dispatch<SetStateAction<string>>;
  setEditDraftQty: Dispatch<SetStateAction<string>>;
  setEditDraftUnit: Dispatch<SetStateAction<string>>;
  setEditingId: Dispatch<SetStateAction<string | null>>;
  setEditSaving: Dispatch<SetStateAction<boolean>>;
  setDuplicatingId: Dispatch<SetStateAction<string | null>>;
  setTogglingId: Dispatch<SetStateAction<string | null>>;
  setRemovingId: Dispatch<SetStateAction<string | null>>;
  setResettingPreset: Dispatch<SetStateAction<boolean>>;
  setCollapsedSectionIds: Dispatch<SetStateAction<Set<string>>>;
  undoDeleteSnapshot: PackItemView[] | null;
  setUndoDeleteSnapshot: Dispatch<SetStateAction<PackItemView[] | null>>;
  setBulkWorking: Dispatch<SetStateAction<BulkWorkingKey>>;
};

export function useTripPackChecklistMutations(
  d: UseTripPackChecklistMutationsArgs,
) {
  const {
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
    newKind,
    newQty,
    newUnit,
    setNewTitle,
    setNewQty,
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
  } = d;

  const { load, refreshChecklist, reorderPeers, bulkSetLinesDone } =
    useTripPackChecklistSync({
      tripId,
      router,
      setItems,
      setLoadError,
      setTripTitle,
      setIsLoading,
      setBulkWorking,
    });

  async function onAddRoot(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let titleSubmit = newTitle.trim();
    if (titleSubmit.length < 1) return;

    const explicitQty = parseQty(newQty);
    let qtyFromExtras = explicitQty;
    let unitTrim = newUnit.trim();

    const kind = pendingParentSectionId ? "line" : newKind;

    if (kind === "line" && explicitQty == null && newQty.trim()) {
      setLoadError(
        "В количестве укажите целое число от 1 до 99999 или оставьте пустым",
      );
      return;
    }
    if (kind === "group" && (explicitQty != null || newQty.trim())) {
      setLoadError("У секции не задают количество");
      return;
    }

    if (kind === "line" && explicitQty == null && !newQty.trim()) {
      const parsedTitle = parseTitleTrailingQty(titleSubmit);
      if (parsedTitle.quantity != null) {
        titleSubmit = parsedTitle.cleanTitle;
        if (titleSubmit.length < 1) {
          setLoadError("После числа нужен текст названия перед разделителем");
          return;
        }
        qtyFromExtras = parsedTitle.quantity;
        if (
          parsedTitle.quantityUnit &&
          parsedTitle.quantityUnit.length > 0 &&
          unitTrim.length === 0
        ) {
          unitTrim = parsedTitle.quantityUnit;
        }
      }
    }

    setAdding(true);
    setLoadError(null);
    try {
      await remote.remotePackAddItem(tripId, {
        title: titleSubmit,
        kind,
        ...(pendingParentSectionId
          ? { parentItemId: pendingParentSectionId }
          : {}),
        ...(kind === "line" && qtyFromExtras != null
          ? { quantity: qtyFromExtras }
          : {}),
        ...(kind === "line" && qtyFromExtras != null && unitTrim.length > 0
          ? { quantityUnit: unitTrim }
          : {}),
      });
      setNewTitle("");
      setNewQty("");
      setNewUnit("");
      setPendingParentSectionId(null);
      setComposerExtrasOpen(false);
      await refreshChecklist();
      focusComposerTitle(newTitleRef.current);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не удалось добавить");
    } finally {
      setAdding(false);
    }
  }

  async function duplicateLine(row: PackItemView) {
    if (row.kind !== "line") return;
    setDuplicatingId(row.id);
    setLoadError(null);
    try {
      await remote.remotePackAddItem(tripId, {
        title: row.title,
        kind: "line",
        ...(row.parentItemId ? { parentItemId: row.parentItemId } : {}),
        ...(row.quantity != null ? { quantity: row.quantity } : {}),
        ...(row.quantity != null &&
        row.quantityUnit &&
        row.quantityUnit.trim().length > 0
          ? { quantityUnit: row.quantityUnit.trim() }
          : {}),
      });
      await refreshChecklist();
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось скопировать пункт",
      );
    } finally {
      setDuplicatingId(null);
    }
  }

  async function toggleDone(row: PackItemView) {
    if (row.kind !== "line") return;
    const nextDone = !row.done;
    const rollback = items;
    setItems((cur) =>
      cur.map((i) => (i.id === row.id ? { ...i, done: nextDone } : i)),
    );
    setTogglingId(row.id);
    setLoadError(null);
    try {
      await remote.remotePackUpdateItemDone(tripId, row.id, nextDone);
    } catch (e) {
      setItems(rollback);
      setLoadError(
        e instanceof Error ? e.message : "Не удалось обновить пункт",
      );
    } finally {
      setTogglingId(null);
    }
  }

  function beginEdit(row: PackItemView) {
    setEditingId(row.id);
    setEditDraftTitle(row.title);
    setEditDraftQty(
      row.kind === "line" && row.quantity != null ? String(row.quantity) : "",
    );
    setEditDraftUnit(
      row.kind === "line" && row.quantityUnit ? row.quantityUnit : "",
    );
  }

  async function saveEdit() {
    if (!editingId) return;
    const row = items.find((i) => i.id === editingId);
    if (!row) return;
    const t = editDraftTitle.trim();
    if (t.length < 1) return;
    const qty = parseQty(editDraftQty);
    if (row.kind === "line" && editDraftQty.trim() && qty == null) {
      setLoadError("Неверное значение количества");
      return;
    }

    setEditSaving(true);
    setLoadError(null);
    try {
      if (row.kind === "group") {
        await remote.remotePackUpdateItemGroupTitle(tripId, editingId, t);
      } else {
        await remote.remotePackUpdateItemLineFields(
          tripId,
          editingId,
          t,
          qty ?? null,
          qty != null && editDraftUnit.trim().length > 0
            ? editDraftUnit.trim()
            : null,
        );
      }
      setEditingId(null);
      await refreshChecklist();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setEditSaving(false);
    }
  }

  async function resetFromPreset() {
    if (
      !window.confirm(
        "Текущий чеклист будет полностью заменён готовым шаблоном вещей в поездку. Все пункты и секции, которые есть сейчас, удалятся. Продолжить?",
      )
    ) {
      return;
    }
    setResettingPreset(true);
    setLoadError(null);
    try {
      const nextItems = await remote.remotePackResetFromPreset(tripId);
      setItems(nextItems);
      setPendingParentSectionId(null);
      setEditingId(null);
      setNewTitle("");
      setNewQty("");
      setNewUnit("");
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось обновить список",
      );
    } finally {
      setResettingPreset(false);
    }
  }

  async function removeRow(row: PackItemView) {
    const ids = collectDescendantPackIds(items, row.id);
    const snapshot = items.filter((r) => ids.has(r.id)) as PackItemView[];
    setRemovingId(row.id);
    setUndoDeleteSnapshot(null);
    try {
      await remote.remotePackRemoveItem(tripId, row.id);
      if (pendingParentSectionId === row.id) setPendingParentSectionId(null);
      if (editingId === row.id) setEditingId(null);
      setCollapsedSectionIds((prev) => {
        const n = new Set(prev);
        for (const id of ids) n.delete(id);
        return n;
      });
      await refreshChecklist();
      setUndoDeleteSnapshot(snapshot.length > 0 ? snapshot : null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setRemovingId(null);
    }
  }

  async function restoreDeletedSnapshot() {
    if (!undoDeleteSnapshot?.length) return;
    const ordered = buildRestorePayloadFromSnapshot(undoDeleteSnapshot);
    setLoadError(null);
    try {
      const next = await remote.remotePackRestoreBatch(tripId, ordered);
      setItems(next);
      setUndoDeleteSnapshot(null);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось вернуть пункты",
      );
    }
  }

  return {
    load,
    refreshChecklist,
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
  };
}
