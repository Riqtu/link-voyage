"use client";

import { Button } from "@/components/ui/button";
import {
  LV_MODAL_BACKDROP_ENTER_CLASS,
  LV_MODAL_PANEL_ENTER_CLASS,
} from "@/lib/lv-motion";
import type { AccommodationPreviewImage } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef } from "react";

export type GallerySectionView = {
  label: string;
  indices: number[];
};

type Props = {
  images: AccommodationPreviewImage[];
  index: number;
  sections: GallerySectionView[];
  onClose: () => void;
  onIndexChange: (next: number) => void;
};

export function AccommodationGalleryOverlay({
  images,
  index,
  sections,
  onClose,
  onIndexChange,
}: Props) {
  const pointerStartXRef = useRef<number | null>(null);
  const pointerStartYRef = useRef<number | null>(null);

  function showPrev() {
    onIndexChange(Math.max(0, index - 1));
  }

  function showNext() {
    onIndexChange(Math.min(images.length - 1, index + 1));
  }

  if (images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[2200] overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Закрыть галерею"
        className={cn(
          "absolute inset-0 z-0 bg-black/85",
          LV_MODAL_BACKDROP_ENTER_CLASS,
        )}
        onClick={onClose}
      />
      <div
        className={cn(
          "relative z-10 mx-auto my-4 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-full max-w-5xl flex-col rounded-xl border border-border/50 bg-background p-3 shadow-2xl",
          LV_MODAL_PANEL_ENTER_CLASS,
        )}
      >
        <div className="mb-2 flex shrink-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm tabular-nums text-muted-foreground">
              {index + 1} / {images.length}
            </p>
            {images[index]?.zone?.trim() ? (
              <p className="mt-0.5 truncate text-sm font-medium leading-snug">
                {images[index]?.zone}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-muted-foreground">
              Стрелки на клавиатуре · свайп на мобильном
            </p>
          </div>
          <Button size="icon" variant="outline" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative min-h-0 shrink-0">
          <div
            className="touch-pan-y flex max-h-[min(70vh,520px)] justify-center overflow-hidden rounded-lg border bg-black"
            onPointerDown={(e) => {
              if (e.pointerType !== "touch") return;
              pointerStartXRef.current = e.clientX;
              pointerStartYRef.current = e.clientY;
            }}
            onPointerUp={(e) => {
              if (e.pointerType !== "touch") return;
              const startX = pointerStartXRef.current;
              const startY = pointerStartYRef.current;
              pointerStartXRef.current = null;
              pointerStartYRef.current = null;
              if (startX === null || startY === null) return;
              const dx = e.clientX - startX;
              const dy = e.clientY - startY;
              if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
              if (dx < 0) {
                showNext();
              } else {
                showPrev();
              }
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL превью */}
            <img
              src={images[index]?.url}
              alt=""
              className="max-h-[min(70vh,520px)] w-auto object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <Button
            size="icon"
            variant="outline"
            className="absolute top-1/2 left-2 z-10 -translate-y-1/2"
            disabled={index <= 0}
            onClick={showPrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="absolute top-1/2 right-2 z-10 -translate-y-1/2"
            disabled={index >= images.length - 1}
            onClick={showNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1 pb-1">
          {sections.map((section) => (
            <div key={section.label}>
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {section.indices.map((idx) => (
                  <button
                    key={`gallery-thumb-${idx}`}
                    type="button"
                    className={cn(
                      "h-12 w-[4.05rem] shrink-0 overflow-hidden rounded-md border-2 bg-black/40 transition-opacity",
                      idx === index
                        ? "border-primary opacity-100"
                        : "border-transparent opacity-80 hover:opacity-100",
                    )}
                    onClick={() => onIndexChange(idx)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={images[idx]?.url}
                      alt=""
                      className="size-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
