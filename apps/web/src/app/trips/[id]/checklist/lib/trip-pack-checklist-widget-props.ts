import type { ChecklistDndActions } from "../components/dnd-list";
import type { ChecklistFilteredListProps } from "../components/filtered-list";
import type { PackItemView } from "./pack-layout";
import { focusComposerTitle, qtyLabel } from "./page-helpers";

type BulkKey =
  | null
  | "all_on"
  | "all_off"
  | `section:${string}:on`
  | `section:${string}:off`;

export type TripPackChecklistWidgetDeps = {
  tripId: string;
  items: PackItemView[];
  visibleRows: PackItemView[];
  collapsedSectionIds: Set<string>;
  lineCountBySectionId: Map<string, number>;
  editingId: string | null;
  editDraftTitle: string;
  editDraftQty: string;
  editDraftUnit: string;
  editSaving: boolean;
  setEditDraftTitle: (v: string) => void;
  setEditDraftQty: (v: string) => void;
  setEditDraftUnit: (v: string) => void;
  setEditingId: (v: string | null) => void;
  beginEdit: (row: PackItemView) => void;
  saveEdit: () => void;
  togglingId: string | null;
  removingId: string | null;
  duplicatingId: string | null;
  toggleDone: (row: PackItemView) => void;
  duplicateLine: (row: PackItemView) => void;
  removeRow: (row: PackItemView) => void;
  bulkSetLinesDone: (
    done: boolean,
    scope: "all_lines" | "section_lines",
    sectionItemId?: string,
  ) => void | Promise<void>;
  toggleSectionCollapsed: (sectionId: string) => void;
  pendingParentSectionId: string | null;
  setPendingParentSectionId: (v: string | null) => void;
  setComposerGlow: (v: boolean) => void;
  bulkWorking: BulkKey;
};

export type TripPackChecklistDndActionsBase = Omit<
  ChecklistDndActions,
  "newTitleRef"
>;
export type TripPackChecklistFilteredListPropsBase = Omit<
  ChecklistFilteredListProps,
  "newTitleRef"
>;

export function buildTripPackChecklistWidgetProps(
  d: TripPackChecklistWidgetDeps,
): {
  checklistDndActions: TripPackChecklistDndActionsBase;
  filteredListProps: TripPackChecklistFilteredListPropsBase;
} {
  const bulkBusy = d.bulkWorking !== null;

  const checklistDndActions: TripPackChecklistDndActionsBase = {
    tripId: d.tripId,
    editingId: d.editingId,
    beginEdit: d.beginEdit,
    saveEdit: d.saveEdit,
    setEditingId: d.setEditingId,
    editDraftTitle: d.editDraftTitle,
    setEditDraftTitle: d.setEditDraftTitle,
    editDraftQty: d.editDraftQty,
    setEditDraftQty: d.setEditDraftQty,
    editDraftUnit: d.editDraftUnit,
    setEditDraftUnit: d.setEditDraftUnit,
    editSaving: d.editSaving,
    toggleDone: d.toggleDone,
    duplicateLine: d.duplicateLine,
    removeRow: d.removeRow,
    togglingId: d.togglingId,
    removingId: d.removingId,
    duplicatingId: d.duplicatingId,
    bulkBusy,
    bulkSetLinesDone: d.bulkSetLinesDone,
    toggleSectionCollapsed: d.toggleSectionCollapsed,
    pendingParentSectionId: d.pendingParentSectionId,
    setPendingParentSectionId: d.setPendingParentSectionId,
    setComposerGlow: d.setComposerGlow,
    focusComposerTitle,
    qtyLabelText: (row) => qtyLabel(row),
    lineCountBySectionId: d.lineCountBySectionId,
  };

  const filteredListProps: TripPackChecklistFilteredListPropsBase = {
    tripId: d.tripId,
    visibleRows: d.visibleRows,
    items: d.items as PackItemView[],
    collapsedSectionIds: d.collapsedSectionIds,
    lineCountBySectionId: d.lineCountBySectionId,
    editingId: d.editingId,
    editDraftTitle: d.editDraftTitle,
    editDraftQty: d.editDraftQty,
    editDraftUnit: d.editDraftUnit,
    editSaving: d.editSaving,
    setEditDraftTitle: d.setEditDraftTitle,
    setEditDraftQty: d.setEditDraftQty,
    setEditDraftUnit: d.setEditDraftUnit,
    setEditingId: d.setEditingId,
    beginEdit: d.beginEdit,
    saveEdit: d.saveEdit,
    togglingId: d.togglingId,
    removingId: d.removingId,
    duplicatingId: d.duplicatingId,
    toggleDone: d.toggleDone,
    duplicateLine: d.duplicateLine,
    removeRow: d.removeRow,
    bulkSetLinesDone: d.bulkSetLinesDone,
    toggleSectionCollapsed: d.toggleSectionCollapsed,
    setPendingParentSectionId: d.setPendingParentSectionId,
    setComposerGlow: d.setComposerGlow,
    focusComposerTitle,
    bulkBusy,
  };

  return { checklistDndActions, filteredListProps };
}
