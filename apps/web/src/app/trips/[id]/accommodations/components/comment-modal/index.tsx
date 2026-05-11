"use client";

import { Button } from "@/components/ui/button";
import {
  LV_MODAL_BACKDROP_ENTER_CLASS,
  LV_MODAL_PANEL_ENTER_CLASS,
} from "@/lib/lv-motion";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  optionTitle: string;
  draft: string;
  onDraftChange: (value: string) => void;
  busy: boolean;
  onClose: () => void;
  onSubmit: () => void;
};

export function AccommodationCommentModal({
  open,
  optionTitle,
  draft,
  onDraftChange,
  busy,
  onClose,
  onSubmit,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2260] overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Закрыть комментарий"
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
            <h2 className="text-lg font-medium">Новый комментарий</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {optionTitle}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onClose}
          >
            Закрыть
          </Button>
        </div>
        <form
          className="mt-4"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
        >
          <textarea
            className="min-h-[120px] w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm"
            placeholder="Текст виден всем участникам поездки…"
            maxLength={2000}
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            disabled={busy}
            autoFocus
          />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onClose}
            >
              Отмена
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Отправка…" : "Отправить"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
