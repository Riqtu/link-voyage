"use client";

import { Button } from "@/components/ui/button";
import { ACCOMMODATION_PREVIEW_IMAGES_MAX } from "@/lib/accommodation-constants";
import { X } from "lucide-react";
import type { AccommodationFormModalPanelProps } from "./types";

export type AccommodationFormGalleryFieldsProps = Pick<
  AccommodationFormModalPanelProps,
  | "previewImages"
  | "setPreviewImages"
  | "uploadBusy"
  | "galleryGeminiBusy"
  | "onUploadImages"
  | "manualImageUrlDraft"
  | "setManualImageUrlDraft"
  | "manualImageZoneDraft"
  | "setManualImageZoneDraft"
  | "addPreviewImageFromUrl"
  | "galleryHtmlDraft"
  | "setGalleryHtmlDraft"
  | "geminiBusy"
  | "onGalleryGeminiFromHtml"
>;

export function AccommodationFormGalleryFields({
  previewImages,
  setPreviewImages,
  uploadBusy,
  galleryGeminiBusy,
  onUploadImages,
  manualImageUrlDraft,
  setManualImageUrlDraft,
  manualImageZoneDraft,
  setManualImageZoneDraft,
  addPreviewImageFromUrl,
  galleryHtmlDraft,
  setGalleryHtmlDraft,
  geminiBusy,
  onGalleryGeminiFromHtml,
}: AccommodationFormGalleryFieldsProps) {
  return (
    <div className="md:col-span-2">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <label className="block text-sm font-medium">
          Фото (опционально), до{" "}
          <span className="tabular-nums">
            {ACCOMMODATION_PREVIEW_IMAGES_MAX}
          </span>
          . У каждого кадра можно указать зону — в галерее они группируются как
          на сайтах бронирования.
        </label>
        {previewImages.length > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={uploadBusy || galleryGeminiBusy}
            onClick={() => {
              setPreviewImages([]);
              setManualImageUrlDraft("");
              setManualImageZoneDraft("");
            }}
          >
            Удалить все фото
          </Button>
        ) : null}
      </div>
      {previewImages.length > 0 ? (
        <ul className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {previewImages.map((row, index) => (
            <li
              key={`${index}-${row.url}`}
              className="rounded-lg border bg-muted/40 p-2"
            >
              <div className="relative aspect-4/3 overflow-hidden rounded-md border bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element -- превью с внешних URL */}
                <img
                  src={row.url}
                  alt=""
                  className="size-full object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="secondary"
                  className="absolute right-1.5 top-1.5 size-8 border border-border/80 bg-background/90 shadow-sm hover:bg-background"
                  aria-label={`Удалить фото ${index + 1}`}
                  onClick={() =>
                    setPreviewImages((prev) =>
                      prev.filter((_, i) => i !== index),
                    )
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>
              <label className="mt-2 block text-[11px] text-muted-foreground">
                Зона (спальня, ванная, вид…)
              </label>
              <input
                className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                placeholder="Например: Спальня 1"
                value={row.zone ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  setPreviewImages((prev) =>
                    prev.map((p, i) =>
                      i === index ? { ...p, zone: v || undefined } : p,
                    ),
                  );
                }}
                maxLength={80}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-2 text-xs text-muted-foreground">
          Загрузите файлы, вставьте прямую ссылку на картинку или добавьте
          фрагмент HTML галереи (Gemini подставит зоны).
        </p>
      )}
      <input
        type="file"
        accept="image/*"
        multiple
        disabled={
          uploadBusy ||
          galleryGeminiBusy ||
          previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX
        }
        onChange={onUploadImages}
        className="w-full cursor-pointer rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_minmax(0,12rem)]">
        <input
          type="url"
          inputMode="url"
          className="min-w-0 rounded-lg border bg-background px-3 py-2 text-sm"
          placeholder="https://… (прямая ссылка на изображение)"
          value={manualImageUrlDraft}
          onChange={(e) => setManualImageUrlDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addPreviewImageFromUrl();
            }
          }}
          disabled={
            previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX ||
            galleryGeminiBusy
          }
        />
        <input
          className="min-w-0 rounded-lg border bg-background px-3 py-2 text-sm"
          placeholder="Зона для этого URL (опц.)"
          value={manualImageZoneDraft}
          onChange={(e) => setManualImageZoneDraft(e.target.value)}
          maxLength={80}
          disabled={
            previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX ||
            galleryGeminiBusy
          }
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={
            previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX ||
            galleryGeminiBusy
          }
          onClick={() => addPreviewImageFromUrl()}
        >
          Добавить по ссылке
        </Button>
      </div>
      <div className="mt-4 space-y-2 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/15 p-3">
        <p className="text-xs text-muted-foreground">
          HTML галереи из DevTools: на странице откройте фото, скопируйте узел
          или фрагмент с ссылками на изображения. В поле «Ссылка на объявление»
          укажите URL той же вкладки — так разрешатся относительные адреса.
        </p>
        <textarea
          className="min-h-[100px] w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
          placeholder="Вставьте HTML блока с фотографиями…"
          value={galleryHtmlDraft}
          onChange={(e) => setGalleryHtmlDraft(e.target.value)}
          disabled={galleryGeminiBusy || geminiBusy}
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={
            galleryGeminiBusy ||
            geminiBusy ||
            previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX
          }
          onClick={() => void onGalleryGeminiFromHtml()}
        >
          {galleryGeminiBusy
            ? "Gemini…"
            : "Добавить фото из HTML (зоны через Gemini)"}
        </Button>
      </div>
      {previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Достигнут лимит {ACCOMMODATION_PREVIEW_IMAGES_MAX} фото — удалите
          лишние, чтобы добавить новые.
        </p>
      ) : null}
      {uploadBusy ? (
        <p className="mt-2 text-xs text-muted-foreground">Загружаем в S3...</p>
      ) : null}
    </div>
  );
}
