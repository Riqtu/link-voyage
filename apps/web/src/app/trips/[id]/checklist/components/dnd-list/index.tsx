"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  CopyPlus,
  GripVertical,
  ListPlus,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { useMemo, type RefObject } from "react";
import { PACK_UNIT_QUICK } from "../../lib/constants";
import {
  buildPackRenderBlocks,
  packPeersForReorder,
  packReorderParentKey,
  sectionLineProgress,
  sectionLinesAllComplete,
  type PackItemView,
  type PackRenderBlock,
} from "../../lib/pack-layout";

export type ChecklistDndActions = {
  tripId: string;
  editingId: string | null;
  beginEdit: (row: PackItemView) => void;
  saveEdit: () => void;
  setEditingId: (id: string | null) => void;
  editDraftTitle: string;
  setEditDraftTitle: (v: string) => void;
  editDraftQty: string;
  setEditDraftQty: (v: string) => void;
  editDraftUnit: string;
  setEditDraftUnit: (v: string) => void;
  editSaving: boolean;
  toggleDone: (row: PackItemView) => void;
  duplicateLine: (row: PackItemView) => void;
  removeRow: (row: PackItemView) => void;
  togglingId: string | null;
  removingId: string | null;
  duplicatingId: string | null;
  bulkBusy: boolean;
  bulkSetLinesDone: (
    done: boolean,
    scope: "all_lines" | "section_lines",
    sectionId?: string,
  ) => void;
  toggleSectionCollapsed: (sectionId: string) => void;
  pendingParentSectionId: string | null;
  setPendingParentSectionId: (id: string | null) => void;
  setComposerGlow: (v: boolean) => void;
  focusComposerTitle: (el: HTMLInputElement | null) => void;
  newTitleRef: RefObject<HTMLInputElement | null>;
  qtyLabelText: (row: PackItemView) => string | null;
  lineCountBySectionId: Map<string, number>;
};

type ChecklistDndListProps = {
  items: PackItemView[];
  collapsedSectionIds: Set<string>;
  actions: ChecklistDndActions;
  onReorderPeers: (
    parentSectionId: string | null,
    orderedItemIds: string[],
  ) => Promise<void> | void;
};

function closeDetailsFromEvent(e: React.MouseEvent | React.KeyboardEvent) {
  const root = (e.currentTarget as HTMLElement).closest("details");
  if (root instanceof HTMLDetailsElement) root.open = false;
}

const overflowMenuPanelClass =
  "absolute end-0 top-full z-30 mt-0.5 min-w-44 rounded-lg border border-border/70 bg-popover px-1 py-1 shadow-md";
const overflowMenuItemClass =
  "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[13px] text-foreground hover:bg-muted/80 disabled:pointer-events-none disabled:opacity-50";

/** Всё для секции, кроме «Строка»: массовые отметки, правка, удаление. */
export function SectionOverflowMenu(props: {
  bulkBusy: boolean;
  showBulk: boolean;
  onBulkAll: () => void;
  onBulkClear: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteBusy: boolean;
}) {
  return (
    <details className="relative shrink-0">
      <summary
        className="flex cursor-pointer list-none items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted/75 hover:text-foreground [&::-webkit-details-marker]:hidden"
        aria-label="Ещё по секции"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </summary>
      <div role="menu" className={overflowMenuPanelClass}>
        {props.showBulk ? (
          <>
            <button
              type="button"
              role="menuitem"
              className={overflowMenuItemClass}
              disabled={props.bulkBusy}
              onClick={(e) => {
                closeDetailsFromEvent(e);
                props.onBulkAll();
              }}
            >
              Отметить все в секции
            </button>
            <button
              type="button"
              role="menuitem"
              className={overflowMenuItemClass}
              disabled={props.bulkBusy}
              onClick={(e) => {
                closeDetailsFromEvent(e);
                props.onBulkClear();
              }}
            >
              Снять отметки в секции
            </button>
          </>
        ) : null}
        <button
          type="button"
          role="menuitem"
          className={overflowMenuItemClass}
          onClick={(e) => {
            closeDetailsFromEvent(e);
            props.onEdit();
          }}
        >
          Изменить секцию
        </button>
        <button
          type="button"
          role="menuitem"
          className={cn(
            overflowMenuItemClass,
            "text-destructive hover:bg-destructive/10 hover:text-destructive",
          )}
          disabled={props.deleteBusy}
          onClick={(e) => {
            closeDetailsFromEvent(e);
            props.onDelete();
          }}
        >
          {props.deleteBusy ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="size-4 shrink-0 opacity-80" aria-hidden />
          )}
          Удалить секцию
        </button>
      </div>
    </details>
  );
}

export function LineOverflowMenu(props: {
  dupBusy: boolean;
  dupDisabled: boolean;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
  deleteBusy: boolean;
}) {
  return (
    <details className="relative shrink-0">
      <summary
        className="flex cursor-pointer list-none items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted/75 hover:text-foreground [&::-webkit-details-marker]:hidden"
        aria-label="Ещё по строке"
      >
        <MoreHorizontal className="size-4" aria-hidden />
      </summary>
      <div role="menu" className={overflowMenuPanelClass}>
        <button
          type="button"
          role="menuitem"
          className={overflowMenuItemClass}
          disabled={props.dupDisabled}
          onClick={(e) => {
            closeDetailsFromEvent(e);
            props.onDuplicate();
          }}
        >
          {props.dupBusy ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <CopyPlus className="size-4 shrink-0 opacity-80" aria-hidden />
          )}
          Дублировать
        </button>
        <button
          type="button"
          role="menuitem"
          className={overflowMenuItemClass}
          onClick={(e) => {
            closeDetailsFromEvent(e);
            props.onEdit();
          }}
        >
          <Pencil className="size-4 shrink-0 opacity-80" aria-hidden />
          Редактировать
        </button>
        <button
          type="button"
          role="menuitem"
          className={cn(
            overflowMenuItemClass,
            "text-destructive hover:bg-destructive/10 hover:text-destructive",
          )}
          disabled={props.deleteBusy}
          onClick={(e) => {
            closeDetailsFromEvent(e);
            props.onDelete();
          }}
        >
          {props.deleteBusy ? (
            <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Trash2 className="size-4 shrink-0 opacity-80" aria-hidden />
          )}
          Удалить
        </button>
      </div>
    </details>
  );
}

function SortableSectionShell(props: {
  id: string;
  disabled: boolean;
  className: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id, disabled: props.disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      className={cn(
        "touch-manipulation shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        props.disabled && "pointer-events-none opacity-35",
      )}
      aria-label="Перетащить секцию"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(props.className, isDragging && "opacity-65")}
    >
      {props.children(handle)}
    </li>
  );
}

function SortableLineShell(props: {
  id: string;
  disabled: boolean;
  className?: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id, disabled: props.disabled });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handle = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      className={cn(
        "touch-manipulation mt-px shrink-0 self-center rounded-md p-1 text-muted-foreground hover:bg-muted/70 hover:text-foreground",
        props.disabled && "pointer-events-none opacity-35",
      )}
      aria-label="Перетащить строку"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4" aria-hidden />
    </button>
  );

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(props.className, isDragging && "opacity-65")}
    >
      {props.children(handle)}
    </li>
  );
}

function RootLineRow(props: {
  row: PackItemView;
  actions: ChecklistDndActions;
  dndDisabled: boolean;
  unitsListId: string;
}) {
  const { row, actions: a, dndDisabled } = props;
  const qtyPretty = a.qtyLabelText(row);
  const isSubgroup = Boolean(row.parentItemId);

  return (
    <SortableLineShell
      id={row.id}
      disabled={dndDisabled}
      className={cn(
        "flex items-center gap-1 px-3 py-1.5 transition-colors hover:bg-muted/25 sm:gap-2 sm:py-2",
        isSubgroup && "ps-10 sm:ps-[2.85rem]",
      )}
    >
      {(handle) => (
        <>
          {handle}
          <label
            className={cn(
              "flex min-h-10 min-w-0 flex-1 cursor-pointer gap-2.5 pe-1 sm:min-h-11 sm:gap-3",
              a.editingId === row.id
                ? "items-start py-1.5"
                : "items-center py-0.5",
            )}
          >
            <input
              type="checkbox"
              checked={row.done}
              disabled={a.togglingId === row.id}
              onChange={() => void a.toggleDone(row)}
              className={cn(
                "size-5 shrink-0 accent-primary rounded border-input motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-90 motion-safe:ease-out",
                a.editingId === row.id && "mt-1.5",
              )}
            />
            <span className="min-w-0 flex-1">
              {a.editingId === row.id ? (
                <span className="block space-y-2">
                  <input
                    value={a.editDraftTitle}
                    onChange={(e) => a.setEditDraftTitle(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none"
                    autoFocus
                    maxLength={200}
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      inputMode="numeric"
                      placeholder="Кол-во"
                      value={a.editDraftQty}
                      aria-label="Количество (необязательно)"
                      onChange={(e) => a.setEditDraftQty(e.target.value)}
                      className="h-9 w-19 rounded-md border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/65"
                    />
                    <input
                      placeholder="шт"
                      aria-label="Единица измерения"
                      value={a.editDraftUnit}
                      onChange={(e) => a.setEditDraftUnit(e.target.value)}
                      maxLength={12}
                      list={props.unitsListId}
                      className="h-9 min-w-22 max-w-28 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/65"
                    />
                  </div>
                  <span className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      className="font-normal"
                      disabled={
                        a.editSaving || a.editDraftTitle.trim().length < 1
                      }
                      onClick={() => void a.saveEdit()}
                    >
                      {a.editSaving ? "Сохранение…" : "Сохранить"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="font-normal text-muted-foreground"
                      disabled={a.editSaving}
                      onClick={() => a.setEditingId(null)}
                    >
                      Отмена
                    </Button>
                  </span>
                </span>
              ) : (
                <span
                  className={cn(
                    "wrap-break-word text-[14px] leading-snug tracking-[-0.01em]",
                    "transition-[color,text-decoration-thickness,text-decoration-color,opacity] duration-200 motion-reduce:duration-150",
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
              )}
            </span>
          </label>
          {a.editingId === row.id ? null : (
            <LineOverflowMenu
              dupBusy={a.duplicatingId === row.id}
              dupDisabled={
                a.duplicatingId === row.id || a.removingId === row.id
              }
              onDuplicate={() => void a.duplicateLine(row)}
              onEdit={() => a.beginEdit(row)}
              onDelete={() => void a.removeRow(row)}
              deleteBusy={a.removingId === row.id}
            />
          )}
        </>
      )}
    </SortableLineShell>
  );
}

function SectionLineRow(props: {
  row: PackItemView;
  actions: ChecklistDndActions;
  dndDisabled: boolean;
  unitsListId: string;
}) {
  const { row, actions: a, dndDisabled, unitsListId } = props;
  const qtyPretty = a.qtyLabelText(row);

  return (
    <SortableLineShell
      id={row.id}
      disabled={dndDisabled}
      className="flex items-center gap-1 bg-background/22 px-3 py-1.5 ps-8 hover:bg-muted/20 sm:gap-2 sm:py-2 sm:ps-12"
    >
      {(handle) => (
        <>
          {handle}
          <label
            className={cn(
              "flex min-h-10 min-w-0 flex-1 cursor-pointer gap-2.5 pe-1 sm:min-h-11 sm:gap-3",
              a.editingId === row.id
                ? "items-start py-1.5"
                : "items-center py-0.5",
            )}
          >
            <input
              type="checkbox"
              checked={row.done}
              disabled={a.togglingId === row.id}
              onChange={() => void a.toggleDone(row)}
              className={cn(
                "size-5 shrink-0 accent-primary rounded border-input motion-safe:transition-transform motion-safe:duration-150 motion-safe:active:scale-90 motion-safe:ease-out",
                a.editingId === row.id && "mt-1.5",
              )}
            />
            <span className="min-w-0 flex-1">
              {a.editingId === row.id ? (
                <span className="block space-y-2">
                  <input
                    value={a.editDraftTitle}
                    onChange={(e) => a.setEditDraftTitle(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none"
                    autoFocus
                    maxLength={200}
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <input
                      inputMode="numeric"
                      placeholder="Кол-во"
                      value={a.editDraftQty}
                      aria-label="Количество (необязательно)"
                      onChange={(e) => a.setEditDraftQty(e.target.value)}
                      className="h-9 w-19 rounded-md border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/65"
                    />
                    <input
                      placeholder="шт"
                      aria-label="Единица измерения"
                      value={a.editDraftUnit}
                      onChange={(e) => a.setEditDraftUnit(e.target.value)}
                      maxLength={12}
                      list={unitsListId}
                      className="h-9 min-w-22 max-w-28 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/65"
                    />
                  </div>
                  <span className="flex flex-wrap gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      className="font-normal"
                      disabled={
                        a.editSaving || a.editDraftTitle.trim().length < 1
                      }
                      onClick={() => void a.saveEdit()}
                    >
                      {a.editSaving ? "Сохранение…" : "Сохранить"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="font-normal text-muted-foreground"
                      disabled={a.editSaving}
                      onClick={() => a.setEditingId(null)}
                    >
                      Отмена
                    </Button>
                  </span>
                </span>
              ) : (
                <span
                  className={cn(
                    "wrap-break-word text-[14px] leading-snug tracking-[-0.01em]",
                    "transition-[color,text-decoration-thickness,text-decoration-color,opacity] duration-200 motion-reduce:duration-150",
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
              )}
            </span>
          </label>
          {a.editingId === row.id ? null : (
            <LineOverflowMenu
              dupBusy={a.duplicatingId === row.id}
              dupDisabled={
                a.duplicatingId === row.id || a.removingId === row.id
              }
              onDuplicate={() => void a.duplicateLine(row)}
              onEdit={() => a.beginEdit(row)}
              onDelete={() => void a.removeRow(row)}
              deleteBusy={a.removingId === row.id}
            />
          )}
        </>
      )}
    </SortableLineShell>
  );
}

function SectionBlock(props: {
  block: PackRenderBlock & { type: "section" };
  items: PackItemView[];
  collapsedSectionIds: Set<string>;
  dndDisabled: boolean;
  actions: ChecklistDndActions;
  unitsListId: string;
}) {
  const { group, lines } = props.block;
  const a = props.actions;
  const sectionCollapsed = props.collapsedSectionIds.has(group.id);
  const sectProg = sectionLineProgress(props.items, group.id);
  const sectionComplete = sectionLinesAllComplete(sectProg);
  const lineCount = a.lineCountBySectionId.get(group.id) ?? 0;
  const lineIds = lines.map((l) => l.id);

  return (
    <SortableSectionShell
      id={group.id}
      disabled={props.dndDisabled}
      className={cn(
        "transition-[background-color] duration-200",
        sectionComplete
          ? "bg-emerald-500/14 dark:bg-emerald-400/14"
          : "bg-muted/20",
      )}
    >
      {(sectionHandle) => (
        <>
          <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-2.5">
            <div className="min-w-0 flex-1">
              {a.editingId === group.id ? (
                <div className="space-y-2">
                  <input
                    value={a.editDraftTitle}
                    onChange={(e) => a.setEditDraftTitle(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none"
                    maxLength={200}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="font-normal"
                      disabled={
                        a.editSaving || a.editDraftTitle.trim().length < 1
                      }
                      onClick={() => void a.saveEdit()}
                    >
                      {a.editSaving ? "Сохранение…" : "Сохранить"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="font-normal text-muted-foreground"
                      disabled={a.editSaving}
                      onClick={() => a.setEditingId(null)}
                    >
                      Отмена
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-10 items-center gap-1.5 sm:min-h-11 sm:gap-2">
                  {!props.dndDisabled ? sectionHandle : null}
                  <button
                    type="button"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground sm:h-10 sm:w-10"
                    aria-expanded={!sectionCollapsed}
                    aria-label={
                      sectionCollapsed
                        ? `Развернуть секцию ${group.title}`
                        : `Свернуть секцию ${group.title}`
                    }
                    onClick={() => a.toggleSectionCollapsed(group.id)}
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
                        {group.title}
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
                    {lineCount === 0 ? (
                      <p className="text-[11px] leading-snug text-muted-foreground/90">
                        Пока нет строк — «Строка» справа или панель внизу.
                      </p>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
            {a.editingId === group.id ? null : (
              <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-1 sm:ms-auto sm:min-h-10">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 gap-1 font-normal text-muted-foreground"
                  onClick={() => {
                    a.setPendingParentSectionId(group.id);
                    a.setComposerGlow(true);
                    a.focusComposerTitle(a.newTitleRef.current);
                  }}
                >
                  <ListPlus className="size-3.5" />
                  Строка
                </Button>
                <SectionOverflowMenu
                  bulkBusy={a.bulkBusy}
                  showBulk={sectProg.total > 0}
                  onBulkAll={() =>
                    void a.bulkSetLinesDone(true, "section_lines", group.id)
                  }
                  onBulkClear={() =>
                    void a.bulkSetLinesDone(false, "section_lines", group.id)
                  }
                  onEdit={() => a.beginEdit(group)}
                  onDelete={() => void a.removeRow(group)}
                  deleteBusy={a.removingId === group.id}
                />
              </div>
            )}
          </div>
          {!sectionCollapsed && lines.length > 0 ? (
            <SortableContext
              items={lineIds}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-border/50 border-border/35 border-t bg-background/30">
                {lines.map((row) => (
                  <SectionLineRow
                    key={row.id}
                    row={row}
                    actions={a}
                    dndDisabled={props.dndDisabled}
                    unitsListId={props.unitsListId}
                  />
                ))}
              </ul>
            </SortableContext>
          ) : null}
        </>
      )}
    </SortableSectionShell>
  );
}

export function ChecklistDndList(props: ChecklistDndListProps) {
  const { items, collapsedSectionIds, actions: a, onReorderPeers } = props;
  const blocks = useMemo(() => buildPackRenderBlocks(items), [items]);
  const rootIds = blocks.map((b) =>
    b.type === "section" ? b.group.id : b.row.id,
  );

  const dndDisabled = a.editingId !== null;
  const unitsListId = `units-${a.tripId}-dnd`;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const aId = String(active.id);
    const oId = String(over.id);
    const rowA = items.find((i) => i.id === aId);
    const rowO = items.find((i) => i.id === oId);
    if (!rowA || !rowO) return;

    const pkA = packReorderParentKey(items, rowA);
    const pkO = packReorderParentKey(items, rowO);
    if (pkA !== pkO) return;

    const peers = packPeersForReorder(items, rowA);
    const oldIndex = peers.findIndex((p) => p.id === aId);
    const newIndex = peers.findIndex((p) => p.id === oId);
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(
      peers.map((p) => p.id),
      oldIndex,
      newIndex,
    );
    await onReorderPeers(pkA, next);
  }

  return (
    <>
      <datalist id={unitsListId}>
        {PACK_UNIT_QUICK.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <DndContext sensors={sensors} onDragEnd={(e) => void handleDragEnd(e)}>
        <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/50">
            {blocks.map((block) =>
              block.type === "rootLine" ? (
                <RootLineRow
                  key={block.row.id}
                  row={block.row}
                  actions={a}
                  dndDisabled={dndDisabled}
                  unitsListId={unitsListId}
                />
              ) : (
                <SectionBlock
                  key={block.group.id}
                  block={block}
                  items={items}
                  collapsedSectionIds={collapsedSectionIds}
                  dndDisabled={dndDisabled}
                  actions={a}
                  unitsListId={unitsListId}
                />
              ),
            )}
          </ul>
        </SortableContext>
      </DndContext>
    </>
  );
}
