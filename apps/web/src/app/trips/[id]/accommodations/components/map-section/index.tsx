"use client";

import { forwardRef } from "react";
import type { Option } from "../../lib/types";
import { AccommodationMap } from "../map";

type Props = {
  mapCenter: { lat: number; lng: number };
  rubPerUsd: number | null;
  focusRequest: { id: string; nonce: number } | null;
  onFocusRequestHandled: () => void;
  onJumpToList: (optionId: string) => void;
  options: Option[];
};

function optionsToMapPoints(options: Option[]) {
  return options.map((item) => ({
    id: item.id,
    title: item.title,
    coordinates: item.coordinates,
    locationLabel: item.locationLabel,
    status: item.status,
    noLongerAvailable: item.noLongerAvailable,
    price: item.price,
    currency: item.currency,
    image: item.previewImages[0]?.url,
    sourceUrl: item.sourceUrl,
  }));
}

export const AccommodationsMapSection = forwardRef<HTMLElement, Props>(
  function AccommodationsMapSection(
    {
      mapCenter,
      rubPerUsd,
      focusRequest,
      onFocusRequestHandled,
      onJumpToList,
      options,
    },
    ref,
  ) {
    return (
      <section
        ref={ref}
        className="mb-6 scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm"
      >
        <h2 className="text-lg font-medium">Общая карта жилья</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Показываются только карточки, где указаны координаты.
        </p>
        <div className="mt-3 h-[360px] overflow-hidden rounded-xl border">
          <AccommodationMap
            center={mapCenter}
            rubPerUsd={rubPerUsd}
            focusRequest={focusRequest}
            onFocusRequestHandled={onFocusRequestHandled}
            onJumpToList={onJumpToList}
            points={optionsToMapPoints(options)}
          />
        </div>
      </section>
    );
  },
);
