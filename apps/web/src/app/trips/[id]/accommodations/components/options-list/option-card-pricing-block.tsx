"use client";

import { Calculator } from "lucide-react";
import {
  formatAmount,
  formatRubAmount,
  isUsdCurrency,
} from "../../lib/page-helpers";
import {
  calcAccommodationPerPerson,
  calcAccommodationTotalPrice,
} from "../../lib/price-calculations";
import {
  getPricingModeHint,
  getPricingModeLabel,
} from "../../lib/pricing-display";
import type { Option } from "../../lib/types";

type Props = {
  item: Option;
  nights: number;
  peopleCount: number;
  rubPerUsd: number | null;
  tripRequirements: string[];
};

export function OptionCardPricingBlock({
  item,
  nights,
  peopleCount,
  rubPerUsd,
  tripRequirements,
}: Props) {
  const total = calcAccommodationTotalPrice(item, nights, peopleCount) ?? null;
  const perPerson =
    calcAccommodationPerPerson(item, nights, peopleCount) ?? null;

  return (
    <>
      {item.amenities.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.amenities.slice(0, 5).map((amenity) => (
            <span
              key={amenity}
              className="rounded-full bg-muted/35 px-2 py-0.5 text-xs text-muted-foreground/85 dark:bg-white/10 dark:text-foreground/65"
            >
              {amenity}
            </span>
          ))}
          {item.amenities.length > 5 ? (
            <span className="rounded-full bg-muted/35 px-2 py-0.5 text-xs text-muted-foreground/85 dark:bg-white/10 dark:text-foreground/65">
              +{item.amenities.length - 5}
            </span>
          ) : null}
        </div>
      ) : null}

      {tripRequirements.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Совпадение с требованиями:{" "}
          {
            tripRequirements.filter((req) =>
              item.amenities
                .map((amenity) => amenity.toLowerCase())
                .includes(req.toLowerCase()),
            ).length
          }
          /{tripRequirements.length}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start">
        {item.previewDescription ? (
          <p className="line-clamp-3 text-sm text-muted-foreground md:line-clamp-4">
            {item.previewDescription}
          </p>
        ) : (
          <div className="hidden md:block" aria-hidden />
        )}

        <aside className="space-y-2 text-xs text-muted-foreground md:border-l md:border-border/50 md:pl-4 dark:md:border-border/80">
          {item.price !== null ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/90">
                    За весь период
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground sm:text-lg">
                    {formatAmount(total ?? 0, item.currency)}
                  </p>
                </div>
                {item.pricingMode !== "total" ? (
                  <span
                    className="inline-flex items-center gap-1 pt-0.5 text-[11px] text-muted-foreground"
                    title={getPricingModeHint(item.pricingMode)}
                  >
                    <Calculator className="size-3.5" aria-hidden />
                    {getPricingModeLabel(item.pricingMode)}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  На человека ({peopleCount}):{" "}
                  <span className="font-medium text-foreground/90">
                    {perPerson !== null
                      ? formatAmount(perPerson, item.currency)
                      : "—"}
                  </span>
                </span>
              </div>
              {rubPerUsd !== null &&
              isUsdCurrency(item.currency) &&
              total !== null &&
              perPerson !== null ? (
                <div>
                  <div>≈ {formatRubAmount(total * rubPerUsd)} общая</div>
                  <div className="mt-0.5">
                    ≈ {formatRubAmount(perPerson * rubPerUsd)} на человека
                  </div>
                </div>
              ) : null}
              {item.freeCancellation ? (
                <span className="inline-flex text-emerald-700 dark:text-emerald-300">
                  Бесплатная отмена
                </span>
              ) : null}
            </>
          ) : (
            <div>Цена не указана — добавьте вручную.</div>
          )}
        </aside>
      </div>
    </>
  );
}
