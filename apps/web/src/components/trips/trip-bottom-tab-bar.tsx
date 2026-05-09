"use client";

import { cn } from "@/lib/utils";
import {
  FileText,
  Hotel,
  LayoutDashboard,
  ListChecks,
  MapPinned,
  Receipt,
} from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

const tabs = [
  {
    key: "overview",
    segment: null as string | null,
    label: "Обзор",
    Icon: LayoutDashboard,
  },
  {
    key: "map",
    segment: "map",
    label: "Карта",
    Icon: MapPinned,
  },
  {
    key: "accommodations",
    segment: "accommodations",
    label: "Жильё",
    Icon: Hotel,
  },
  {
    key: "checklist",
    segment: "checklist",
    label: "Чеклист",
    Icon: ListChecks,
  },
  {
    key: "receipts",
    segment: "receipts",
    label: "Чеки",
    Icon: Receipt,
  },
  {
    key: "documents",
    segment: "documents",
    label: "Докум.",
    Icon: FileText,
  },
] as const;

function segmentActive(
  pathname: string,
  tripBase: string,
  segment: string | null,
): boolean {
  if (segment === null) {
    return pathname === tripBase || pathname === `${tripBase}/`;
  }
  return pathname.startsWith(`${tripBase}/${segment}`);
}

export function TripBottomTabBar() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const tripBase = `/trips/${id}`;

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-[90]",
        "border-t border-border/80 bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md supports-[backdrop-filter]:bg-background/80",
      )}
      aria-label="Разделы поездки"
    >
      <div className="mx-auto flex h-14 max-w-6xl items-stretch gap-0.5 px-1 sm:gap-1 sm:px-3">
        {tabs.map(({ key, segment, label, Icon }) => {
          const active = segmentActive(pathname, tripBase, segment);
          const href = segment ? `${tripBase}/${segment}` : tripBase;

          return (
            <Link
              key={key}
              href={href}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-[10px] font-medium transition-colors sm:gap-1 sm:px-1.5 sm:text-xs",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0 sm:size-[1.35rem]",
                  active && "text-primary",
                )}
                aria-hidden
                strokeWidth={active ? 2.25 : 1.75}
              />
              <span className="max-w-full truncate">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
