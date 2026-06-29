"use client";

import { Button } from "@/components/ui/button";
import { lvStaggerStyle } from "@/lib/lv-motion";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import { categoryLabelByValue } from "../lib/category-meta";
import type { TripPoint } from "../lib/types";

type TripMapPointsDrawerProps = {
  points: TripPoint[];
  pointsListOpen: boolean;
  onToggleList: () => void;
  focusedPointId: string | null;
  onFocusPoint: (point: TripPoint) => void;
  onAddPoint: () => void;
  onEditPoint: (point: TripPoint) => void;
  onRemovePoint: (pointId: string) => void;
};

export function TripMapPointsDrawer({
  points,
  pointsListOpen,
  onToggleList,
  focusedPointId,
  onFocusPoint,
  onAddPoint,
  onEditPoint,
  onRemovePoint,
}: TripMapPointsDrawerProps) {
  return (
    <aside
      className={cn(
        "fixed inset-x-2 bottom-[calc(0.5rem+var(--lv-trip-tab-recess))] z-20 overflow-hidden rounded-xl border bg-card/92 shadow-xl backdrop-blur-md",
        /* max-height (+ min-height на sm) — одинаково анимируем мобилку и десктоп. */
        "ease-[cubic-bezier(0.33,1,0.68,1)] duration-300 motion-reduce:duration-150",
        "transition-[max-height] sm:transition-[max-height,min-height]",
        "w-[calc(100%-1rem)] max-w-none sm:inset-x-auto sm:right-6 sm:bottom-[calc(1rem+var(--lv-trip-tab-recess))] sm:w-[min(24rem,92vw)]",
        !pointsListOpen && "max-h-[2.875rem] sm:min-h-[2.875rem]",
        pointsListOpen &&
          cn(
            "max-h-[min(52dvh,calc(100dvh-9rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--lv-trip-tab-recess)))]",
            "sm:max-h-[calc(100dvh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--lv-trip-tab-recess))]",
            "sm:min-h-[calc(100dvh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--lv-trip-tab-recess))]",
          ),
      )}
    >
      {/*
          flex-col-reverse: ручка внизу панели (у таб-бара), при max-h режется верх контента —
          визуально вся карточка заезжает вниз, остаётся только ручка.
        */}
      <div className="flex max-h-[inherit] flex-col-reverse sm:h-full sm:min-h-0">
        <button
          type="button"
          id="trip-points-drawer-handle"
          className="flex w-full touch-manipulation items-center justify-center gap-2 border-border/70 border-t px-4 py-2.5 text-sm font-semibold hover:bg-muted/40 active:bg-muted/55 supports-[backdrop-filter]:bg-muted/35"
          aria-expanded={pointsListOpen}
          aria-controls="trip-points-drawer-main"
          onClick={() => {
            onToggleList();
          }}
        >
          <span className="text-foreground tabular-nums">
            Точки ({points.length})
          </span>
          <span className="text-muted-foreground">
            <span className="sr-only">
              {pointsListOpen ? "Свернуть панель" : "Развернуть панель"}
            </span>
            {pointsListOpen ? (
              <ChevronDown
                className="size-4 transition-transform motion-reduce:transition-none"
                aria-hidden
              />
            ) : (
              <ChevronUp
                className="size-4 transition-transform motion-reduce:transition-none"
                aria-hidden
              />
            )}
          </span>
        </button>

        <div
          id="trip-points-drawer-main"
          role="region"
          aria-labelledby="trip-points-heading"
          aria-hidden={!pointsListOpen}
          inert={!pointsListOpen ? true : undefined}
          className={cn(
            "flex min-h-0 max-h-[min(46dvh,22rem)] flex-1 flex-col gap-3 overflow-hidden p-4 pb-2 sm:max-h-none sm:flex-1",
            !pointsListOpen && "pointer-events-none",
          )}
        >
          <Button className="w-full shrink-0" onClick={onAddPoint}>
            Добавить точку
          </Button>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
            <h3
              id="trip-points-heading"
              className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
            >
              Список ({points.length})
            </h3>
            <ul className="space-y-2" aria-labelledby="trip-points-heading">
              {points.map((point, index) => (
                <li
                  key={point.id}
                  className={cn(
                    "relative cursor-pointer rounded-lg border bg-background/80 p-2 transition-[background-color,box-shadow,transform] duration-200 hover:bg-muted/50",
                    "motion-safe:active:scale-[0.99]",
                    "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:zoom-in-95 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:ease-out",
                    focusedPointId === point.id &&
                      "shadow-md ring-2 ring-primary/35 ring-offset-1 ring-offset-background",
                  )}
                  style={lvStaggerStyle(index, 40)}
                  onClick={() => onFocusPoint(point)}
                >
                  <div className="absolute top-2 right-2 z-1 flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7"
                      aria-label={`Изменить точку ${point.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEditPoint(point);
                      }}
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-7 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      aria-label={`Удалить точку ${point.title}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        void onRemovePoint(point.id);
                      }}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/30">
                      {point.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- user-provided or S3 preview image
                        <img
                          src={point.imageUrl}
                          alt=""
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                          Нет фото
                        </div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{point.title}</p>
                      <p className="mt-1">
                        <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          {categoryLabelByValue[point.category]}
                        </span>
                      </p>
                      {point.description ? (
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {point.description}
                        </p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted-foreground">
                        {point.coordinates.lat.toFixed(5)},{" "}
                        {point.coordinates.lng.toFixed(5)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </aside>
  );
}
