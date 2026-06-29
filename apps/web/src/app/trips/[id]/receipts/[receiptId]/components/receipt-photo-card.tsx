"use client";

import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";

type ReceiptPhotoCardProps = {
  imageUrl?: string | null;
  uploadBusy: boolean;
  analyzeBusy: boolean;
  fileRef: RefObject<HTMLInputElement | null>;
  onPickPhoto: (e: ChangeEvent<HTMLInputElement>) => void;
  onAnalyze: () => void;
  onOpenModal: () => void;
  photoModalOpen: boolean;
};

export function ReceiptPhotoCard({
  imageUrl,
  uploadBusy,
  analyzeBusy,
  fileRef,
  onPickPhoto,
  onAnalyze,
  onOpenModal,
  photoModalOpen,
}: ReceiptPhotoCardProps) {
  return (
    <section className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="text-sm font-semibold">Фото чека</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Загрузите чёткий снимок
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={uploadBusy}
          onClick={() => fileRef.current?.click()}
        >
          {uploadBusy
            ? "Загрузка…"
            : imageUrl
              ? "Заменить фото"
              : "Выбрать фото"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          hidden
          onChange={(e) => void onPickPhoto(e)}
        />
        <Button
          type="button"
          disabled={analyzeBusy || !imageUrl}
          onClick={() => void onAnalyze()}
        >
          <Sparkles className="size-4 sm:mr-1" aria-hidden />
          {analyzeBusy ? "Разбираем…" : "Разобрать с Gemini"}
        </Button>
      </div>
      {imageUrl ? (
        <button
          type="button"
          className="group mt-4 block w-fit max-w-full rounded-lg border bg-muted text-left outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onOpenModal}
          aria-haspopup="dialog"
          aria-expanded={photoModalOpen}
          title="Открыть в полном размере"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- превью чека */}
          <img
            src={imageUrl}
            alt="Чек — нажмите для просмотра"
            className="max-h-80 w-auto max-w-full rounded-[inherit] object-contain"
          />
          <span className="sr-only">Открыть фото чека крупно</span>
        </button>
      ) : null}
    </section>
  );
}
