"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ExternalLink,
  MapPin,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  closeNearestDetailsMenu,
  lodgingQuickToolbarBtnClass,
} from "../../lib/page-helpers";
import type { Option } from "../../lib/types";

type Props = {
  item: Option;
  canCollaborate: boolean;
  selectedIds: string[];
  revealAccommodationOnMap: (item: Option) => void;
  toggleCompare: (optionId: string) => void;
  onVote: (optionId: string, value: "up" | "down") => void;
  toggleBooked: (item: Option) => void;
  toggleNoLongerAvailable: (item: Option) => void;
  onStartEditing: (item: Option) => void;
  onDelete: (optionId: string) => void;
};

export function OptionCardToolbar({
  item,
  canCollaborate,
  selectedIds,
  revealAccommodationOnMap,
  toggleCompare,
  onVote,
  toggleBooked,
  toggleNoLongerAvailable,
  onStartEditing,
  onDelete,
}: Props) {
  return (
    <div className="mt-5 rounded-lg border border-border/50 bg-muted/10 p-2.5 dark:border-border/75 sm:p-3">
      <div
        className={cn(
          "flex gap-2",
          "flex-col max-md:*:w-full max-md:*:justify-center",
          "md:flex-row md:flex-wrap md:items-center",
        )}
      >
        {!canCollaborate ? (
          <Button
            size="sm"
            variant={selectedIds.includes(item.id) ? "default" : "outline"}
            className="shrink-0 gap-1 md:w-auto"
            onClick={() => toggleCompare(item.id)}
          >
            {selectedIds.includes(item.id) ? "В сравнении" : "Сравнить"}
          </Button>
        ) : null}

        {canCollaborate ? (
          <div className="flex w-full min-w-0 shrink-0 gap-2 md:w-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!item.coordinates}
              title={
                item.coordinates
                  ? "Показать на общей карте жилья"
                  : "Сначала задайте координаты варианта при редактировании"
              }
              aria-label={item.coordinates ? "На карте" : "Нет координат"}
              className={cn(lodgingQuickToolbarBtnClass, "px-0")}
              onClick={() => revealAccommodationOnMap(item)}
            >
              <MapPin className="size-4" aria-hidden />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(
                lodgingQuickToolbarBtnClass,
                "px-0 text-base leading-none md:px-0",
                item.userVote === "up" &&
                  "border-emerald-500/60 bg-emerald-500/15 text-emerald-900 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-300",
              )}
              aria-label="Лайкнуть вариант"
              onClick={() => void onVote(item.id, "up")}
            >
              👍
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(
                lodgingQuickToolbarBtnClass,
                "px-0 text-base leading-none md:px-0",
                item.userVote === "down" &&
                  "border-red-500/60 bg-red-500/15 text-red-900 ring-1 ring-red-500/30 hover:bg-red-500/20 dark:text-red-300",
              )}
              aria-label="Дизлайкнуть вариант"
              onClick={() => void onVote(item.id, "down")}
            >
              👎
            </Button>
            {item.sourceUrl ? (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title="Открыть источник"
                aria-label="Открыть источник во внешней вкладке"
                className={cn(
                  buttonVariants({
                    variant: "outline",
                    size: "sm",
                  }),
                  lodgingQuickToolbarBtnClass,
                  "inline-flex shrink-0 no-underline",
                  "border-dashed px-0",
                )}
              >
                <ExternalLink className="size-4 opacity-80" aria-hidden />
              </a>
            ) : null}
          </div>
        ) : (
          <div className="flex w-full shrink-0 gap-2 md:w-auto">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!item.coordinates}
              title={
                item.coordinates
                  ? "Показать на общей карте жилья"
                  : "Нет координат на карте"
              }
              aria-label={item.coordinates ? "На карте" : "Нет координат"}
              className={cn(lodgingQuickToolbarBtnClass, "px-0")}
              onClick={() => revealAccommodationOnMap(item)}
            >
              <MapPin className="size-4" aria-hidden />
            </Button>
            {item.sourceUrl ? (
              <a
                href={item.sourceUrl}
                target="_blank"
                rel="noreferrer"
                title="Открыть источник"
                aria-label="Открыть источник во внешней вкладке"
                className={cn(
                  buttonVariants({
                    variant: "outline",
                    size: "sm",
                  }),
                  lodgingQuickToolbarBtnClass,
                  "inline-flex shrink-0 no-underline",
                  "border-dashed px-0",
                )}
              >
                <ExternalLink className="size-4 opacity-80" aria-hidden />
              </a>
            ) : null}
          </div>
        )}

        {canCollaborate ? (
          <details
            className={cn(
              "group relative shrink-0 max-md:w-full",
              "md:ml-auto",
            )}
          >
            <summary
              className={cn(
                buttonVariants({
                  variant: "outline",
                  size: "sm",
                }),
                "flex h-9 min-h-9 cursor-pointer list-none items-center justify-center gap-2 md:h-9 [&::-webkit-details-marker]:hidden max-md:w-full md:min-h-9",
              )}
              aria-label="Дополнительные действия с вариантом"
            >
              <MoreHorizontal
                className="size-4 text-muted-foreground"
                aria-hidden
              />
              <span>Ещё</span>
            </summary>
            <div
              role="menu"
              className="absolute top-[calc(100%+0.375rem)] right-0 z-30 min-w-50 rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-lg max-md:inset-x-0 max-md:right-0 max-md:left-0"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-auto w-full justify-start rounded-none px-3 py-2 font-normal",
                  item.status === "booked" && "bg-muted/70 font-medium",
                )}
                onClick={(e) => {
                  void toggleBooked(item);
                  closeNearestDetailsMenu(e.currentTarget);
                }}
              >
                {item.status === "booked" ? "Снять бронь" : "Забронировать"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-auto w-full justify-start rounded-none px-3 py-2 font-normal",
                  selectedIds.includes(item.id) &&
                    "bg-primary/12 font-medium text-primary",
                )}
                onClick={(e) => {
                  toggleCompare(item.id);
                  closeNearestDetailsMenu(e.currentTarget);
                }}
              >
                {selectedIds.includes(item.id) ? "В сравнении" : "Сравнить"}
              </Button>
              <div className="my-1 h-px bg-border" aria-hidden />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 font-normal"
                title={
                  item.noLongerAvailable
                    ? "Показывать снова как доступный для брони"
                    : "Приглушить карточку для команды — объект занят другими"
                }
                onClick={(e) => {
                  void toggleNoLongerAvailable(item);
                  closeNearestDetailsMenu(e.currentTarget);
                }}
              >
                {item.noLongerAvailable ? "Снова доступно" : "Занято у других"}
              </Button>
              <div className="my-1 h-px bg-border" aria-hidden />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 font-normal"
                onClick={(e) => {
                  closeNearestDetailsMenu(e.currentTarget);
                  onStartEditing(item);
                }}
              >
                <Pencil className="size-4 text-muted-foreground" aria-hidden />
                Редактировать
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={(e) => {
                  closeNearestDetailsMenu(e.currentTarget);
                  void onDelete(item.id);
                }}
              >
                <Trash2 className="size-4" aria-hidden />
                Удалить
              </Button>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
