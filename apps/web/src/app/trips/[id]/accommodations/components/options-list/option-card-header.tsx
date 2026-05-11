"use client";

import { AccommodationStatusBadge } from "@/components/accommodation-status-badge";
import type { Option } from "../../lib/types";

type Props = {
  item: Option;
  isTopVoted: boolean;
  isLowVoted: boolean;
  openAccommodationDetail: (item: Option) => void;
  openVoteModal: (optionId: string) => void;
};

export function OptionCardHeader({
  item,
  isTopVoted,
  isLowVoted,
  openAccommodationDetail,
  openVoteModal,
}: Props) {
  return (
    <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-3">
      <div className="min-w-0">
        <h3 className="min-w-0 text-lg font-semibold leading-snug text-foreground">
          <button
            type="button"
            className="block w-full max-w-full cursor-pointer rounded  text-left font-semibold text-inherit text-pretty decoration-primary underline-offset-4 outline-none transition-colors line-clamp-2 hover:bg-muted/60 hover:text-primary hover:underline focus-visible:bg-muted/60 focus-visible:text-primary focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring"
            title="Подробный вид варианта"
            aria-label={`Открыть подробный вид: ${item.title}`}
            onClick={() => openAccommodationDetail(item)}
          >
            {item.title}
          </button>
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {item.noLongerAvailable ? (
            <span
              className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground"
              title="Помечено как недоступное для бронирования"
            >
              Занято / недоступно
            </span>
          ) : null}
          {item.locationLabel ? (
            <span className="text-xs text-muted-foreground">
              {item.locationLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs md:justify-end">
        <button
          type="button"
          className="rounded-full bg-muted/25 px-2.5 py-1 text-foreground/90 transition hover:bg-muted/45 dark:bg-white/10 dark:hover:bg-white/15"
          onClick={() => openVoteModal(item.id)}
          title="Посмотреть, кто как проголосовал"
        >
          <span className="font-medium">
            {item.rating !== null ? (
              <>
                ★ <span className="tabular-nums">{item.rating}</span> ·{" "}
              </>
            ) : null}
            Голоса{" "}
            <span className="tabular-nums">
              {item.upVotes - item.downVotes}
            </span>
          </span>
        </button>
        {isTopVoted ? (
          <span className="rounded-full bg-emerald-500/12 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Топ по голосам
          </span>
        ) : null}
        {isLowVoted ? (
          <span className="rounded-full bg-rose-500/12 px-2 py-1 text-[11px] font-medium text-rose-700 dark:text-rose-300">
            Меньше голосов
          </span>
        ) : null}
        <AccommodationStatusBadge status={item.status} />
      </div>
    </div>
  );
}
