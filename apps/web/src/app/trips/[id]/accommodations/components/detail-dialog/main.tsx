"use client";

import { cn } from "@/lib/utils";
import { MapPin } from "lucide-react";
import {
  formatAmount,
  formatRubAmount,
  isUsdCurrency,
} from "../../lib/page-helpers";
import {
  calcAccommodationPerPerson,
  calcAccommodationTotalPrice,
} from "../../lib/price-calculations";
import { getPricingModeLabel } from "../../lib/pricing-display";
import type { Option } from "../../lib/types";
import { AccommodationMap } from "../map";
import type { AccommodationDetailSharedProps } from "./types";

type Props = { option: Option } & AccommodationDetailSharedProps;

export function DetailMain(props: Props) {
  const {
    option,
    galleryIndex,
    onGalleryIndexChange,
    nights,
    peopleCount,
    rubPerUsd,
    tripRequirements,
    onOpenGallery,
  } = props;

  return (
    <div className="mt-4 grid gap-6 lg:grid-cols-5">
      <div className="min-w-0 space-y-3 lg:col-span-3">
        {option.previewImages.length > 0 ? (
          <>
            <button
              type="button"
              className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-muted shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              title="Открыть галерею"
              onClick={() => onOpenGallery(option.previewImages, galleryIndex)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  option.previewImages[galleryIndex]?.url ??
                  option.previewImages[0]!.url
                }
                alt=""
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                referrerPolicy="no-referrer"
              />
              <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
                Открыть галерею
              </span>
            </button>
            {option.previewImages.length > 1 ? (
              <div
                role="tablist"
                aria-label="Миниатюры фото"
                className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
              >
                {option.previewImages.map((img, idx) => (
                  <button
                    key={`${option.id}-dthumb-${idx}`}
                    role="tab"
                    type="button"
                    aria-selected={galleryIndex === idx}
                    onClick={() => onGalleryIndexChange(idx)}
                    title={img.zone?.trim() || undefined}
                    className={cn(
                      "relative h-14 w-[3.85rem] shrink-0 overflow-hidden rounded-lg border-2 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
                      galleryIndex === idx
                        ? "border-primary"
                        : "border-transparent opacity-80 hover:opacity-100",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.url}
                      alt=""
                      className="size-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
            Нет фотографий
          </div>
        )}
        {option.previewDescription ? (
          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Описание
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
              {option.previewDescription}
            </p>
          </div>
        ) : null}
        {option.amenities.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Удобства
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {option.amenities.map((amenity) => (
                <span
                  key={`${option.id}-am-${amenity}`}
                  className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {amenity}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {tripRequirements.length ? (
          <p className="text-xs text-muted-foreground">
            Совпадение с требованиями поездки:{" "}
            {
              tripRequirements.filter((req) =>
                option.amenities
                  .map((a) => a.toLowerCase())
                  .includes(req.toLowerCase()),
              ).length
            }
            /{tripRequirements.length}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:col-span-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Расположение
          </p>
          <div className="mt-2 h-[220px] overflow-hidden rounded-xl border sm:h-[260px]">
            {option.coordinates ? (
              <AccommodationMap
                center={option.coordinates}
                rubPerUsd={rubPerUsd}
                points={[
                  {
                    id: option.id,
                    title: option.title,
                    coordinates: option.coordinates,
                    locationLabel: option.locationLabel,
                    status: option.status,
                    noLongerAvailable: option.noLongerAvailable,
                    price: option.price,
                    currency: option.currency,
                    image: option.previewImages[0]?.url,
                    sourceUrl: option.sourceUrl,
                  },
                ]}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/40 px-3 text-center text-sm text-muted-foreground">
                <MapPin className="size-8 opacity-55" aria-hidden />У варианта
                нет координат.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border bg-muted/30 p-4">
          {option.price !== null ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">
                  Общая цена:{" "}
                  {formatAmount(
                    calcAccommodationTotalPrice(option, nights, peopleCount) ??
                      0,
                    option.currency,
                  )}
                </p>
                <span className="text-xs text-muted-foreground">
                  Тип: {getPricingModeLabel(option.pricingMode)}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                На человека ({peopleCount}):{" "}
                {calcAccommodationPerPerson(option, nights, peopleCount) !==
                null
                  ? formatAmount(
                      calcAccommodationPerPerson(option, nights, peopleCount) ??
                        0,
                      option.currency,
                    )
                  : "—"}
              </p>
              {rubPerUsd !== null &&
              isUsdCurrency(option.currency) &&
              calcAccommodationTotalPrice(option, nights, peopleCount) !==
                null &&
              calcAccommodationPerPerson(option, nights, peopleCount) !==
                null ? (
                <div className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                  <p>
                    ≈{" "}
                    {formatRubAmount(
                      (calcAccommodationTotalPrice(
                        option,
                        nights,
                        peopleCount,
                      ) ?? 0) * rubPerUsd,
                    )}{" "}
                    общая
                  </p>
                  <p className="mt-0.5">
                    ≈{" "}
                    {formatRubAmount(
                      (calcAccommodationPerPerson(
                        option,
                        nights,
                        peopleCount,
                      ) ?? 0) * rubPerUsd,
                    )}{" "}
                    на человека
                  </p>
                </div>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Цена не указана.</p>
          )}
          {option.rating !== null ? (
            <p className="mt-2 text-sm text-muted-foreground">
              Рейтинг:{" "}
              <span className="font-medium text-foreground">
                {option.rating}
              </span>
            </p>
          ) : null}
          {option.freeCancellation ? (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
              Бесплатная отмена
            </p>
          ) : null}
        </div>

        {option.notes ? (
          <div className="rounded-xl border border-dashed border-border/80 p-3">
            <p className="text-xs font-medium text-muted-foreground">Заметки</p>
            <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
              {option.notes}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
