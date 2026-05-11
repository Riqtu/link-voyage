"use client";

import { LV_MODAL_BACKDROP_ENTER_CLASS } from "@/lib/lv-motion";
import { cn } from "@/lib/utils";
import { AccommodationFormModalPanel } from "./panel";
import type { AccommodationFormModalProps } from "./types";

export type { AccommodationFormModalProps } from "./types";

export function AccommodationFormModal({
  open,
  ...panelProps
}: AccommodationFormModalProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[2000] overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="presentation"
    >
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 z-0 bg-black/50",
          LV_MODAL_BACKDROP_ENTER_CLASS,
        )}
      />
      {/* Панель вынесена целиком — сохраняем те же motion-классы */}
      <AccommodationFormModalPanel {...panelProps} />
    </div>
  );
}
