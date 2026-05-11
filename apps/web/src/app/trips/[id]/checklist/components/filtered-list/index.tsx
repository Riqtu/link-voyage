"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, ListPlus } from "lucide-react";
import type { RefObject } from "react";
import { PACK_UNIT_QUICK } from "../../lib/constants";
import {
  sectionLineProgress,
  sectionLinesAllComplete,
  type PackItemView,
} from "../../lib/pack-layout";
import { qtyLabel } from "../../lib/page-helpers";
import { LineOverflowMenu, SectionOverflowMenu } from "../dnd-list";

export type ChecklistFilteredListProps = {
  tripId: string;
  visibleRows: PackItemView[];
  items: PackItemView[];
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
  setPendingParentSectionId: (v: string | null) => void;
  setComposerGlow: (v: boolean) => void;
  focusComposerTitle: (el: HTMLInputElement | null) => void;
  newTitleRef: RefObject<HTMLInputElement | null>;
  bulkBusy: boolean;
};

export function ChecklistFilteredList({
  tripId,
  visibleRows,
  items,
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
  setPendingParentSectionId,
  setComposerGlow,
  focusComposerTitle,
  newTitleRef,
  bulkBusy,
}: ChecklistFilteredListProps) {
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/50">
      {visibleRows.map((row) => {
        const isSubgroup = Boolean(row.parentItemId);
        const qtyPretty = qtyLabel(row);
        if (row.kind === "group") {
          const sectProg = sectionLineProgress(items, row.id);
          const sectionComplete = sectionLinesAllComplete(sectProg);
          const sectionCollapsed = collapsedSectionIds.has(row.id);
          return (
            <li
              key={row.id}
              className={cn(
                "px-3 py-3 transition-[background-color] duration-200 sm:py-2.5",
                sectionComplete
                  ? "bg-emerald-500/14 dark:bg-emerald-400/14"
                  : "bg-muted/20",
              )}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0 flex-1">
                  {editingId === row.id ? (
                    <div className="space-y-2">
                      <input
                        value={editDraftTitle}
                        onChange={(e) => setEditDraftTitle(e.target.value)}
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none"
                        maxLength={200}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          className="font-normal"
                          disabled={
                            editSaving || editDraftTitle.trim().length < 1
                          }
                          onClick={() => void saveEdit()}
                        >
                          {editSaving ? "Сохранение…" : "Сохранить"}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="font-normal text-muted-foreground"
                          disabled={editSaving}
                          onClick={() => setEditingId(null)}
                        >
                          Отмена
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex min-h-10 items-center gap-2 sm:min-h-11">
                      <button
                        type="button"
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground sm:h-10 sm:w-10"
                        aria-expanded={!sectionCollapsed}
                        aria-label={
                          sectionCollapsed
                            ? `Развернуть секцию ${row.title}`
                            : `Свернуть секцию ${row.title}`
                        }
                        onClick={() => toggleSectionCollapsed(row.id)}
                      >
                        {sectionCollapsed ? (
                          <ChevronRight className="size-5" aria-hidden />
                        ) : (
                          <ChevronDown className="size-5" aria-hidden />
                        )}
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-px">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-px">
                          <p
                            className={cn(
                              "text-[13px] font-medium leading-tight",
                              sectionComplete
                                ? "text-emerald-900 dark:text-emerald-100"
                                : "text-foreground",
                            )}
                            title={
                              sectionComplete
                                ? "Все пункты в секции выполнены"
                                : undefined
                            }
                          >
                            {row.title}
                          </p>
                          {sectProg.total > 0 ? (
                            <span
                              className={cn(
                                "text-[11px] tabular-nums leading-none",
                                sectionComplete
                                  ? "font-medium text-emerald-800 dark:text-emerald-200"
                                  : "text-muted-foreground",
                              )}
                              title={
                                sectionComplete
                                  ? "Все пункты выполнены"
                                  : "Готово строк в секции"
                              }
                            >
                              {sectProg.done}/{sectProg.total}
                            </span>
                          ) : null}
                        </div>
                        {(lineCountBySectionId.get(row.id) ?? 0) === 0 ? (
                          <p className="text-[11px] leading-snug text-muted-foreground/90">
                            Пока нет строк — кнопка «Строка» справа или панель
                            внизу.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
                {editingId === row.id ? null : (
                  <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-1 sm:ms-auto sm:min-h-10">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 font-normal text-muted-foreground"
                      onClick={() => {
                        setPendingParentSectionId(row.id);
                        setComposerGlow(true);
                        focusComposerTitle(newTitleRef.current);
                      }}
                    >
                      <ListPlus className="size-3.5" />
                      Строка
                    </Button>
                    <SectionOverflowMenu
                      bulkBusy={bulkBusy}
                      showBulk={sectProg.total > 0}
                      onBulkAll={() =>
                        void bulkSetLinesDone(true, "section_lines", row.id)
                      }
                      onBulkClear={() =>
                        void bulkSetLinesDone(false, "section_lines", row.id)
                      }
                      onEdit={() => beginEdit(row)}
                      onDelete={() => void removeRow(row)}
                      deleteBusy={removingId === row.id}
                    />
                  </div>
                )}
              </div>
            </li>
          );
        }

        return (
          <li
            key={row.id}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 transition-colors hover:bg-muted/25 sm:py-2",
              isSubgroup && "pl-6 sm:pl-9",
            )}
          >
            <label
              className={cn(
                "flex min-h-11 min-w-0 flex-1 cursor-pointer gap-3 pe-1",
                editingId === row.id
                  ? "items-start py-1.5"
                  : "items-center py-0.5",
              )}
            >
              <input
                type="checkbox"
                checked={row.done}
                disabled={togglingId === row.id}
                onChange={() => void toggleDone(row)}
                className={cn(
                  "size-5 shrink-0 rounded border-input",
                  editingId === row.id && "mt-1.5",
                )}
              />
              <span className="min-w-0 flex-1">
                {editingId === row.id ? (
                  <span className="block space-y-2">
                    <input
                      value={editDraftTitle}
                      onChange={(e) => setEditDraftTitle(e.target.value)}
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none"
                      autoFocus
                      maxLength={200}
                    />
                    <div className="flex flex-wrap items-end gap-2">
                      <input
                        inputMode="numeric"
                        placeholder="Кол-во"
                        value={editDraftQty}
                        aria-label="Количество (необязательно)"
                        onChange={(e) => setEditDraftQty(e.target.value)}
                        className="h-9 w-19 rounded-md border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/65"
                      />
                      <input
                        placeholder="шт"
                        aria-label="Единица измерения"
                        value={editDraftUnit}
                        onChange={(e) => setEditDraftUnit(e.target.value)}
                        maxLength={12}
                        list={`units-${tripId}-edit`}
                        className="h-9 min-w-22 max-w-28 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/65"
                      />
                      <datalist id={`units-${tripId}-edit`}>
                        {PACK_UNIT_QUICK.map((u) => (
                          <option key={u} value={u} />
                        ))}
                      </datalist>
                    </div>
                    <span className="flex flex-wrap gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        className="font-normal"
                        disabled={
                          editSaving || editDraftTitle.trim().length < 1
                        }
                        onClick={() => void saveEdit()}
                      >
                        {editSaving ? "Сохранение…" : "Сохранить"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="font-normal text-muted-foreground"
                        disabled={editSaving}
                        onClick={() => setEditingId(null)}
                      >
                        Отмена
                      </Button>
                    </span>
                  </span>
                ) : (
                  <>
                    <span
                      className={cn(
                        "wrap-break-word text-[14px] leading-snug tracking-[-0.01em]",
                        row.done &&
                          "text-muted-foreground line-through decoration-muted-foreground/60",
                      )}
                    >
                      {row.title}
                      {qtyPretty ? (
                        <span className="ms-2 tabular-nums text-muted-foreground">
                          {qtyPretty}
                        </span>
                      ) : null}
                    </span>
                  </>
                )}
              </span>
            </label>
            {editingId === row.id ? null : (
              <LineOverflowMenu
                dupBusy={duplicatingId === row.id}
                dupDisabled={duplicatingId === row.id || removingId === row.id}
                onDuplicate={() => void duplicateLine(row)}
                onEdit={() => beginEdit(row)}
                onDelete={() => void removeRow(row)}
                deleteBusy={removingId === row.id}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
