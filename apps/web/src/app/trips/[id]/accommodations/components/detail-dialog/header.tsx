"use client";

import { AccommodationStatusBadge } from "@/components/accommodation-status-badge";
import { Dialog } from "@base-ui/react/dialog";
import { MapPin, X } from "lucide-react";
import type { Option } from "../../lib/types";

export function DetailHeader({ option }: { option: Option }) {
  return (
    <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
      <div className="min-w-0">
        <Dialog.Title className="text-xl font-semibold tracking-tight text-pretty">
          {option.title}
        </Dialog.Title>
        <Dialog.Description className="sr-only">
          Подробный вид варианта жилья: фото, карта и данные для сравнения.
        </Dialog.Description>
        {option.provider ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {option.provider}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <AccommodationStatusBadge status={option.status} />
          {option.noLongerAvailable ? (
            <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
              Занято / недоступно
            </span>
          ) : null}
          {option.locationLabel ? (
            <span className="flex items-start gap-1 text-xs text-muted-foreground">
              <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>{option.locationLabel}</span>
            </span>
          ) : null}
        </div>
      </div>
      <Dialog.Close
        className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
        aria-label="Закрыть"
      >
        <X className="size-5" aria-hidden />
      </Dialog.Close>
    </div>
  );
}
