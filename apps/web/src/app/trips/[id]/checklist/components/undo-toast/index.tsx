"use client";

import { Button } from "@/components/ui/button";
import type { PackItemView } from "../../lib/pack-layout";

type Props = {
  snapshot: PackItemView[] | null;
  onRestore: () => void;
  onDismiss: () => void;
};

export function ChecklistUndoToast({ snapshot, onRestore, onDismiss }: Props) {
  if (!snapshot) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-42 flex justify-center px-3 bottom-[calc(var(--lv-trip-tab-recess,0px)+6.75rem)]"
      role="status"
      aria-live="polite"
    >
      <div className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/95 px-3 py-2.5 text-[13px] shadow-lg backdrop-blur-md dark:bg-background/92">
        <p className="min-w-0 text-muted-foreground">
          Удалено:{" "}
          <span className="font-medium text-foreground">
            {snapshot.length === 1
              ? snapshot[0]!.title
              : `${snapshot.length} пунктов`}
          </span>
        </p>
        <span className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="font-normal"
            onClick={() => void onRestore()}
          >
            Вернуть
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 px-2 font-normal text-muted-foreground"
            aria-label="Скрыть уведомление об удалении"
            onClick={onDismiss}
          >
            Скрыть
          </Button>
        </span>
      </div>
    </div>
  );
}
