"use client";

import { AccommodationStatusBadge } from "@/components/accommodation-status-badge";
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

type Props = {
  compareOptions: Option[];
  nights: number;
  peopleCount: number;
  rubPerUsd: number | null;
};

export function AccommodationCompareTableSection({
  compareOptions,
  nights,
  peopleCount,
  rubPerUsd,
}: Props) {
  if (compareOptions.length < 2) return null;

  return (
    <section className="mt-8 overflow-x-auto rounded-2xl border bg-card p-5 shadow-sm">
      <h2 className="mb-3 text-lg font-medium">
        Таблица сравнения ({compareOptions.length})
      </h2>
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="pr-4">Параметр</th>
            {compareOptions.map((item) => (
              <th key={item.id} className="pr-4">
                {item.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="pr-4 py-2">Общая цена</td>
            {compareOptions.map((item) => (
              <td key={item.id} className="pr-4 align-top">
                {item.price !== null ? (
                  <>
                    <span>
                      {formatAmount(
                        calcAccommodationTotalPrice(
                          item,
                          nights,
                          peopleCount,
                        ) ?? 0,
                        item.currency,
                      )}
                    </span>
                    {rubPerUsd !== null && isUsdCurrency(item.currency) ? (
                      <span className="mt-1 block whitespace-nowrap text-muted-foreground">
                        ≈{" "}
                        {formatRubAmount(
                          (calcAccommodationTotalPrice(
                            item,
                            nights,
                            peopleCount,
                          ) ?? 0) * rubPerUsd,
                        )}
                      </span>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td className="pr-4 py-2">На человека ({peopleCount})</td>
            {compareOptions.map((item) => (
              <td key={item.id} className="pr-4 align-top">
                {item.price !== null ? (
                  <>
                    <span>
                      {formatAmount(
                        calcAccommodationPerPerson(item, nights, peopleCount) ??
                          0,
                        item.currency,
                      )}
                    </span>
                    {rubPerUsd !== null && isUsdCurrency(item.currency) ? (
                      <span className="mt-1 block whitespace-nowrap text-muted-foreground">
                        ≈{" "}
                        {formatRubAmount(
                          (calcAccommodationPerPerson(
                            item,
                            nights,
                            peopleCount,
                          ) ?? 0) * rubPerUsd,
                        )}
                      </span>
                    ) : null}
                  </>
                ) : (
                  "—"
                )}
              </td>
            ))}
          </tr>
          <tr>
            <td className="pr-4 py-2">Тип цены</td>
            {compareOptions.map((item) => (
              <td key={item.id} className="pr-4">
                {getPricingModeLabel(item.pricingMode)}
              </td>
            ))}
          </tr>
          <tr>
            <td className="pr-4 py-2 align-middle">Статус</td>
            {compareOptions.map((item) => (
              <td key={item.id} className="pr-4 align-middle">
                <AccommodationStatusBadge status={item.status} />
              </td>
            ))}
          </tr>
          <tr>
            <td className="pr-4 py-2">Рейтинг</td>
            {compareOptions.map((item) => (
              <td key={item.id} className="pr-4">
                {item.rating ?? "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="pr-4 py-2">Бесплатная отмена</td>
            {compareOptions.map((item) => (
              <td key={item.id} className="pr-4">
                {item.freeCancellation ? "Да" : "Нет"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="pr-4 py-2">Голоса (баланс)</td>
            {compareOptions.map((item) => (
              <td key={item.id} className="pr-4">
                {item.upVotes - item.downVotes}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}
