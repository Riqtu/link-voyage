"use client";

import dynamic from "next/dynamic";

export const TripMapLazy = dynamic(
  () => import("@/components/trip-map").then((mod) => mod.TripMap),
  { ssr: false },
);
