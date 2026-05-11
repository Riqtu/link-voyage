"use client";

import dynamic from "next/dynamic";

/** Карта без SSR (Google Maps в браузере). */
export const AccommodationMap = dynamic(
  () =>
    import("@/components/accommodation-map").then(
      (mod) => mod.AccommodationMap,
    ),
  { ssr: false },
);
