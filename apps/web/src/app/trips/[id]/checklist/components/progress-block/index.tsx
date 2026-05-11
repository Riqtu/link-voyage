"use client";

import { Search } from "lucide-react";

type BulkKey =
  | null
  | "all_on"
  | "all_off"
  | `section:${string}:on`
  | `section:${string}:off`;

type Props = {
  doneLines: number;
  lineRowsLength: number;
  bulkWorking: BulkKey;
  itemCount: number;
  filterQuery: string;
  onFilterQueryChange: (value: string) => void;
  onBulkAll: () => void;
  onBulkClear: () => void;
};

export function ChecklistProgressBlock({
  doneLines,
  lineRowsLength,
  bulkWorking,
  itemCount,
  filterQuery,
  onFilterQueryChange,
  onBulkAll,
  onBulkClear,
}: Props) {
  const bulkBusy = bulkWorking !== null;

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          className="flex items-center gap-2 text-[13px] tabular-nums text-muted-foreground"
          title="Отмечено / всего пунктов со чекбоксом"
        >
          <span className="font-medium text-foreground">{doneLines}</span>
          <span className="text-muted-foreground/35" aria-hidden>
            /
          </span>
          <span>{lineRowsLength}</span>
          <span className="sr-only" aria-live="polite">
            Отмечено {doneLines} из {lineRowsLength} строк
          </span>
          {lineRowsLength > 0 ? (
            <span className="text-muted-foreground/80" aria-hidden>
              ({Math.round((doneLines / lineRowsLength) * 100)}%)
            </span>
          ) : null}
        </div>
        {lineRowsLength > 0 ? (
          <span className="flex flex-wrap items-center gap-1 border-l border-border/60 ps-3 text-[12px] text-muted-foreground">
            <span className="me-1" aria-hidden>
              Массово:
            </span>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[12px] text-foreground hover:bg-muted/80"
              disabled={bulkBusy}
              onClick={() => void onBulkAll()}
            >
              Отметить всё
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-[12px] text-foreground hover:bg-muted/80"
              disabled={bulkBusy}
              onClick={() => void onBulkClear()}
            >
              Снять все
            </button>
          </span>
        ) : null}
      </div>
      <div
        className="h-1 overflow-hidden rounded-full bg-muted dark:bg-muted/65"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={lineRowsLength > 0 ? lineRowsLength : 1}
        aria-valuenow={lineRowsLength > 0 ? doneLines : 0}
        aria-label="Доля собранных пунктов"
      >
        <div
          className="h-full rounded-full bg-primary/70 transition-[width] duration-300 ease-out dark:bg-primary/60"
          style={{
            width:
              lineRowsLength === 0
                ? "0%"
                : `${(doneLines / lineRowsLength) * 100}%`,
          }}
        />
      </div>
      {itemCount > 0 ? (
        <div className="relative">
          <Search
            className="pointer-events-none absolute inset-s-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            value={filterQuery}
            onChange={(e) => onFilterQueryChange(e.target.value)}
            placeholder="Поиск по списку…"
            autoComplete="off"
            aria-label="Поиск по чеклисту"
            className="w-full rounded-lg border border-input bg-background py-2 ps-10 pe-3 text-[13px] shadow-none outline-none placeholder:text-muted-foreground/55 focus-visible:ring-2 focus-visible:ring-ring/35"
          />
        </div>
      ) : null}
    </div>
  );
}
