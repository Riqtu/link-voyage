"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FolderPlus, SlidersHorizontal } from "lucide-react";
import type { FormEvent, RefObject } from "react";
import { PACK_UNIT_QUICK } from "../../lib/constants";

type Props = {
  tripId: string;
  composerShellRef: RefObject<HTMLDivElement | null>;
  composerExtrasOpen: boolean;
  onComposerExtrasOpenChange: (open: boolean) => void;
  composerGlow: boolean;
  pendingParentSectionId: string | null;
  onClearPendingSection: () => void;
  newTitleRef: RefObject<HTMLInputElement | null>;
  pendingSectionTitlePreview: string;
  newTitle: string;
  onNewTitleChange: (value: string) => void;
  newKind: "line" | "group";
  onNewKindChange: (kind: "line" | "group") => void;
  newQty: string;
  onNewQtyChange: (value: string) => void;
  newUnit: string;
  onNewUnitChange: (value: string) => void;
  effectiveKind: "line" | "group";
  adding: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function ChecklistBottomComposer({
  tripId,
  composerShellRef,
  composerExtrasOpen,
  onComposerExtrasOpenChange,
  composerGlow,
  pendingParentSectionId,
  onClearPendingSection,
  newTitleRef,
  pendingSectionTitlePreview,
  newTitle,
  onNewTitleChange,
  newKind,
  onNewKindChange,
  newQty,
  onNewQtyChange,
  newUnit,
  onNewUnitChange,
  effectiveKind,
  adding,
  onSubmit,
}: Props) {
  return (
    <footer
      className={cn(
        "pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 pt-2 bottom-[var(--lv-trip-tab-recess,0px)] pb-2",
      )}
      aria-label="Добавить в чеклист"
    >
      <div
        ref={composerShellRef}
        className="pointer-events-auto relative w-full max-w-2xl"
      >
        {composerExtrasOpen ? (
          <button
            type="button"
            aria-label="Закрыть настройки"
            className="fixed inset-0 z-45 bg-background/55 backdrop-blur-[1px] dark:bg-black/35"
            onClick={() => onComposerExtrasOpenChange(false)}
          />
        ) : null}

        <form
          className={cn(
            "relative z-50 overflow-hidden rounded-2xl border border-border/70 bg-background/92 shadow-[0_-8px_32px_-16px_rgb(0,0,0,0.2)] backdrop-blur-md",
            "dark:border-border/50 dark:bg-background/90",
          )}
          onSubmit={(event) => void onSubmit(event)}
        >
          {composerExtrasOpen ? (
            <div
              id="composer-extras-region"
              className={cn(
                "border-b border-border/55 px-3 py-2.5",
                "space-y-2.5",
              )}
              role="region"
              aria-label={
                pendingParentSectionId ? "Число и единица" : "Тип пункта"
              }
            >
              {!pendingParentSectionId ? (
                <fieldset className="flex flex-wrap gap-3 text-[13px] text-muted-foreground">
                  <legend className="sr-only">Что добавляем</legend>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="new-kind"
                      checked={newKind === "group"}
                      onChange={() => onNewKindChange("group")}
                      className="border-input text-primary"
                    />
                    <FolderPlus className="size-3.5 opacity-75" aria-hidden />
                    Секция
                  </label>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="radio"
                      name="new-kind"
                      checked={newKind === "line"}
                      onChange={() => onNewKindChange("line")}
                      className="border-input text-primary"
                    />
                    Пункт
                  </label>
                </fieldset>
              ) : null}

              {effectiveKind === "line" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    inputMode="numeric"
                    placeholder="Количество"
                    value={newQty}
                    aria-label="Количество (необязательно)"
                    onChange={(e) => onNewQtyChange(e.target.value)}
                    className="h-10 w-20 shrink-0 rounded-lg border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/45"
                  />
                  <input
                    placeholder="шт, пар…"
                    value={newUnit}
                    aria-label="Единица измерения"
                    onChange={(e) => onNewUnitChange(e.target.value)}
                    list={`units-${tripId}-new`}
                    maxLength={12}
                    className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/45 sm:max-w-52"
                  />
                  <datalist id={`units-${tripId}-new`}>
                    {PACK_UNIT_QUICK.map((u) => (
                      <option key={u} value={u} />
                    ))}
                  </datalist>
                </div>
              ) : null}

              <button
                type="button"
                className="w-full rounded-lg py-1.5 text-center text-[12px] text-muted-foreground hover:bg-muted/50"
                onClick={() => onComposerExtrasOpenChange(false)}
              >
                Свернуть
              </button>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5 p-2 sm:p-2.5">
            {pendingParentSectionId ? (
              <div className="flex justify-center px-1">
                <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                  <span className="max-w-52 truncate">
                    {pendingSectionTitlePreview || "…"}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-full px-1 text-foreground hover:bg-muted/80"
                    aria-label="Добавлять не в секцию"
                    onClick={onClearPendingSection}
                  >
                    ×
                  </button>
                </span>
              </div>
            ) : null}

            <div className="flex min-h-11 items-center gap-1.5 sm:gap-2">
              <input
                ref={newTitleRef}
                value={newTitle}
                onChange={(e) => onNewTitleChange(e.target.value)}
                aria-label={
                  pendingParentSectionId
                    ? "Название строки внутри секции"
                    : newKind === "group"
                      ? "Название секции"
                      : "Название пункта"
                }
                placeholder={
                  pendingParentSectionId
                    ? "Название…"
                    : newKind === "group"
                      ? "Название секции…"
                      : "Пункт или «Носки — 5 шт»…"
                }
                maxLength={200}
                className={cn(
                  "min-h-10 min-w-0 flex-1 rounded-xl border border-transparent bg-muted/30 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/45 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-muted/22",
                  composerGlow &&
                    !composerExtrasOpen &&
                    "checklist-composer-glow",
                )}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0 rounded-xl border-border/70 shadow-none sm:size-10"
                aria-expanded={composerExtrasOpen}
                aria-controls="composer-extras-region"
                title={
                  pendingParentSectionId
                    ? "Число и единица"
                    : "Тип и количество"
                }
                aria-label={
                  pendingParentSectionId
                    ? "Число и единица"
                    : "Тип и количество"
                }
                onClick={() => onComposerExtrasOpenChange(!composerExtrasOpen)}
              >
                <SlidersHorizontal
                  className="size-[18px] text-muted-foreground"
                  aria-hidden
                />
              </Button>
              <Button
                type="submit"
                className="h-11 min-h-10 shrink-0 rounded-xl px-4 font-normal shadow-none sm:h-10"
                disabled={adding || newTitle.trim().length < 1}
              >
                {adding ? "…" : "Добавить"}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </footer>
  );
}
