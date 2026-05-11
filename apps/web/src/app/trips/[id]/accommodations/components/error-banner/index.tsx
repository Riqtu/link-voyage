"use client";

import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

type Props = {
  message: string | null;
  onDismiss: () => void;
};

export function AccommodationsErrorBanner({ message, onDismiss }: Props) {
  if (!message) return null;
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] left-1/2 z-[2600] w-[min(92vw,34rem)] max-w-[calc(100vw-1rem)] -translate-x-1/2 px-2"
    >
      <div className="flex items-start gap-2 rounded-xl border border-destructive/45 bg-card py-2 pl-4 pr-2 shadow-xl">
        <p className="min-w-0 flex-1 py-1.5 text-sm leading-snug text-destructive">
          {message}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="Закрыть сообщение"
          onClick={onDismiss}
        >
          <X className="size-4" />
        </Button>
      </div>
      <p className="mt-1 px-1 text-center text-[11px] text-muted-foreground">
        Esc — закрыть
      </p>
    </div>
  );
}
