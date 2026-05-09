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
import { useCallback, useLayoutEffect, useRef, useState } from "react";

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
  const activeIndex = tabs.findIndex(({ segment }) =>
    segmentActive(pathname, tripBase, segment),
  );

  const navRef = useRef<HTMLDivElement>(null);
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number }>({
    left: 0,
    width: 0,
  });

  const syncIndicator = useCallback(() => {
    const nav = navRef.current;
    const link =
      activeIndex >= 0 ? (linkRefs.current[activeIndex] ?? null) : null;
    if (!nav || !link) {
      setIndicator({ left: 0, width: 0 });
      return;
    }
    const nr = nav.getBoundingClientRect();
    const lr = link.getBoundingClientRect();
    setIndicator({
      left: lr.left - nr.left + nav.scrollLeft,
      width: lr.width,
    });
  }, [activeIndex]);

  useLayoutEffect(() => {
    syncIndicator();
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncIndicator);
      return () => window.removeEventListener("resize", syncIndicator);
    }
    const ro = new ResizeObserver(() => {
      syncIndicator();
    });
    ro.observe(nav);
    window.addEventListener("resize", syncIndicator);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncIndicator);
    };
  }, [syncIndicator, pathname, id]);

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-[90]",
        "border-t border-border/80 bg-background/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-md supports-[backdrop-filter]:bg-background/80",
      )}
      aria-label="Разделы поездки"
    >
      <div
        ref={navRef}
        className="relative mx-auto flex h-14 max-w-6xl items-stretch gap-0.5 px-1 sm:gap-1 sm:px-3"
      >
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute bottom-0 rounded-full bg-primary",
            indicator.width > 0 ? "opacity-100" : "opacity-0",
            "motion-safe:h-[3px] motion-safe:transition-[left,width,opacity] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.33,1,0.68,1)]",
            "motion-reduce:transition-opacity motion-reduce:duration-200",
          )}
          style={{
            left: indicator.left,
            width: indicator.width,
          }}
        />
        {tabs.map(({ key, segment, label, Icon }, index) => {
          const active = segmentActive(pathname, tripBase, segment);
          const href = segment ? `${tripBase}/${segment}` : tripBase;

          return (
            <Link
              key={key}
              ref={(el) => {
                linkRefs.current[index] = el;
              }}
              href={href}
              className={cn(
                "relative z-10 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-1 text-[10px] font-medium sm:gap-1 sm:px-1.5 sm:text-xs",
                "motion-safe:transition-[color,transform] motion-safe:duration-200 motion-safe:ease-out",
                "motion-safe:active:scale-[0.96]",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0 motion-safe:transition-[transform,color] motion-safe:duration-200 motion-safe:ease-out sm:size-[1.35rem]",
                  active && "scale-105 text-primary",
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
