"use client";

import { Button } from "@/components/ui/button";
import {
  LV_MODAL_BACKDROP_ENTER_CLASS,
  LV_MODAL_PANEL_ENTER_CLASS,
} from "@/lib/lv-motion";
import { cn } from "@/lib/utils";
import type { Option } from "../../lib/types";

type Props = {
  open: boolean;
  option: Option | undefined;
  onClose: () => void;
};

export function AccommodationVoteModal({ open, option, onClose }: Props) {
  if (!open) return null;

  const upVoters = option?.votes.filter((v) => v.value === "up") ?? [];
  const downVoters = option?.votes.filter((v) => v.value === "down") ?? [];

  return (
    <div
      className="fixed inset-0 z-[2260] overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Закрыть окно голосов"
        className={cn(
          "absolute inset-0 z-0 bg-black/50",
          LV_MODAL_BACKDROP_ENTER_CLASS,
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 mx-auto my-6 flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl",
          LV_MODAL_PANEL_ENTER_CLASS,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-medium">Голоса по варианту</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {option?.title ?? "Вариант жилья"}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3">
            <div className="text-sm font-medium text-emerald-700 dark:text-emerald-500">
              За ({upVoters.length})
            </div>
            {upVoters.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Пока нет голосов.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {upVoters.map((v) => (
                  <li key={`${v.userId}-up`} className="truncate">
                    {v.userName}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
            <div className="text-sm font-medium text-destructive">
              Против ({downVoters.length})
            </div>
            {downVoters.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Пока нет голосов.
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {downVoters.map((v) => (
                  <li key={`${v.userId}-down`} className="truncate">
                    {v.userName}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
