"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ExternalLink, MapPin, Printer } from "lucide-react";
import type { Option } from "../../lib/types";
import type { AccommodationDetailSharedProps } from "./types";

type Props = { option: Option } & Pick<
  AccommodationDetailSharedProps,
  | "selectedIds"
  | "canCollaborate"
  | "onCloseDetail"
  | "onRevealOnMainMap"
  | "onToggleCompare"
  | "onPrint"
  | "onToggleNoLongerAvailable"
  | "onVote"
  | "onOpenVoteModal"
  | "onEdit"
>;

export function DetailFooter(props: Props) {
  const {
    option,
    selectedIds,
    canCollaborate,
    onCloseDetail,
    onRevealOnMainMap,
    onToggleCompare,
    onPrint,
    onToggleNoLongerAvailable,
    onVote,
    onOpenVoteModal,
    onEdit,
  } = props;

  return (
    <div className="mt-5 grid gap-2 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={!option.coordinates}
          onClick={() => {
            onCloseDetail();
            onRevealOnMainMap(option);
          }}
        >
          <MapPin className="size-3.5" aria-hidden />
          На общей карте
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onToggleCompare(option.id);
          }}
        >
          {selectedIds.includes(option.id)
            ? "Убрать из сравнения"
            : "В сравнение"}
        </Button>
        {option.sourceUrl ? (
          <a
            href={option.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className={cn(
              buttonVariants({
                variant: "outline",
                size: "sm",
              }),
              "inline-flex gap-1.5 no-underline",
            )}
          >
            <ExternalLink
              className="size-3.5 shrink-0 opacity-80"
              aria-hidden
            />
            Открыть источник
          </a>
        ) : null}
        {canCollaborate ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            className="md:ml-auto"
            onClick={() => {
              onCloseDetail();
              onEdit(option);
            }}
          >
            Редактировать
          </Button>
        ) : null}
      </div>
      {canCollaborate ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => onPrint(option)}
          >
            <Printer className="size-3.5" aria-hidden />
            Распечатать
          </Button>
          <Button
            type="button"
            size="sm"
            variant={option.noLongerAvailable ? "secondary" : "outline"}
            title="Отметить, что объект занят другими"
            onClick={() => void onToggleNoLongerAvailable(option)}
          >
            {option.noLongerAvailable ? "Снова доступно" : "Занято у других"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1"
            onClick={() => onOpenVoteModal(option.id)}
          >
            Голоса:{" "}
            <span className="tabular-nums font-medium">
              {option.upVotes - option.downVotes}
            </span>
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              option.userVote === "up" &&
                "border-emerald-500/80 bg-emerald-500/25 text-emerald-900 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 dark:text-emerald-300",
            )}
            aria-label="Лайкнуть вариант"
            onClick={() => void onVote(option.id, "up")}
          >
            👍
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              option.userVote === "down" &&
                "border-red-500/80 bg-red-500/25 text-red-900 ring-1 ring-red-500/40 hover:bg-red-500/30 dark:text-red-300",
            )}
            aria-label="Дизлайкнуть вариант"
            onClick={() => void onVote(option.id, "down")}
          >
            👎
          </Button>
        </div>
      ) : null}
    </div>
  );
}
