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
      setIndicator((prev) =>
        prev.left === 0 && prev.width === 0 ? prev : { left: 0, width: 0 },
      );
      return;
    }
    const nr = nav.getBoundingClientRect();
    const lr = link.getBoundingClientRect();
    const left = lr.left - nr.left + nav.scrollLeft;
    const width = lr.width;
    setIndicator((prev) => {
      if (
        Math.abs(prev.left - left) < 0.5 &&
        Math.abs(prev.width - width) < 0.5
      ) {
        return prev;
      }
      return { left, width };
    });
  }, [activeIndex]);

  useLayoutEffect(() => {
    let raf = 0;
    const scheduleSync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        syncIndicator();
      });
    };

    syncIndicator();

    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", scheduleSync);
      return () => {
        cancelAnimationFrame(raf);
        window.removeEventListener("resize", scheduleSync);
      };
    }
    const ro = new ResizeObserver(() => {
      scheduleSync();
    });
    ro.observe(nav);
    window.addEventListener("resize", scheduleSync);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("resize", scheduleSync);
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
            "lv-trip-tab-indicator pointer-events-none absolute bottom-0 h-[3px] rounded-full bg-primary",
            indicator.width > 0 ? "opacity-100" : "opacity-0",
            "motion-safe:transition-[left,width,opacity]",
            "motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.33,1,0.68,1)]",
            "motion-reduce:transition-opacity motion-reduce:duration-150",
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
                "relative z-10 flex min-w-0 flex-1 touch-manipulation flex-col items-center justify-center gap-0.5 rounded-lg px-0.5 py-2 text-[10px] font-medium select-none [-webkit-tap-highlight-color:transparent] sm:gap-1 sm:px-1.5 sm:py-1.5 sm:text-xs",
                "motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-out",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0 motion-safe:transition-colors motion-safe:duration-150 sm:size-[1.35rem]",
                  active && "text-primary lg:origin-center lg:scale-105",
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
