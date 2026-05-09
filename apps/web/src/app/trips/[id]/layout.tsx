"use client";

import { TripBottomTabBar } from "@/components/trips/trip-bottom-tab-bar";
import { LV_PAGE_SEGMENT_ENTER_CLASS } from "@/lib/lv-motion";
import { LV_TRIP_TAB_SHELL } from "@/lib/trip-tab-bar";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";

export default function TripIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const segmentKey =
    parts[0] === "trips" && parts.length > 2
      ? parts.slice(2).join("-")
      : "overview";

  return (
    <div className={cn(LV_TRIP_TAB_SHELL, "flex min-h-0 flex-1 flex-col")}>
      <div
        key={segmentKey}
        className={cn(
          "min-h-min flex-1 pb-[var(--lv-trip-tab-recess)]",
          LV_PAGE_SEGMENT_ENTER_CLASS,
        )}
      >
        {children}
      </div>
      <TripBottomTabBar />
    </div>
  );
}
