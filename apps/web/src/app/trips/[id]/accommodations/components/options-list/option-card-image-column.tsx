"use client";

import type { AccommodationPreviewImage } from "@/lib/trpc";
import type { Option } from "../../lib/types";

type Props = {
  item: Option;
  openGallery: (
    images: AccommodationPreviewImage[],
    startIndex?: number,
  ) => void;
};

export function OptionCardImageColumn({ item, openGallery }: Props) {
  return (
    <div>
      {item.previewImages[0] ? (
        <button
          type="button"
          className="w-full text-left"
          title={item.previewImages[0].zone ?? undefined}
          onClick={() => openGallery(item.previewImages, 0)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL превью без white-list в next/image */}
          <img
            src={item.previewImages[0].url}
            alt=""
            className="h-44 w-full rounded-lg object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </button>
      ) : (
        <div className="flex h-44 w-full items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
          Нет изображения
        </div>
      )}
      {item.previewImages.length > 1 ? (
        <div className="mt-2 grid grid-cols-3 gap-2">
          {item.previewImages.slice(1, 9).map((image, index) => (
            <button
              key={`${item.id}-thumb-${image.url}-${index}`}
              type="button"
              title={image.zone ?? undefined}
              className="relative overflow-hidden rounded-md border"
              onClick={() => openGallery(item.previewImages, index + 1)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL превью без white-list в next/image */}
              <img
                src={image.url}
                alt=""
                className="h-14 w-full object-cover md:h-16"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              {image.zone ? (
                <span className="absolute bottom-0 left-0 right-0 truncate bg-black/55 px-0.5 text-[9px] leading-tight text-white">
                  {image.zone}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
