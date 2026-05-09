"use client";

import { TripBottomTabBar } from "@/components/trips/trip-bottom-tab-bar";
import { LV_TRIP_TAB_SHELL } from "@/lib/trip-tab-bar";
import { cn } from "@/lib/utils";

export default function TripIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={cn(LV_TRIP_TAB_SHELL, "flex min-h-0 flex-1 flex-col")}>
      <div className="min-h-min flex-1 pb-[var(--lv-trip-tab-recess)]">
        {children}
      </div>
      <TripBottomTabBar />
    </div>
  );
}
