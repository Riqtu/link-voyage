"use client";

import { lvStaggerStyle } from "@/lib/lv-motion";
import type { AccommodationPreviewImage } from "@/lib/trpc";
import { computeVoteBalanceExtremes } from "../../lib/list-derivations";
import type { AccommodationCommentRow, Option } from "../../lib/types";
import { AccommodationOptionCard } from "./option-card";

type VoteExtremes = ReturnType<typeof computeVoteBalanceExtremes>;

type Props = {
  isLoading: boolean;
  optionsForList: Option[];
  voteExtremes: VoteExtremes;
  highlightedCardId: string | null;
  nights: number;
  peopleCount: number;
  rubPerUsd: number | null;
  tripRequirements: string[];
  commentsByOption: Record<string, AccommodationCommentRow[]>;
  canCollaborate: boolean;
  selectedIds: string[];
  openGallery: (
    images: AccommodationPreviewImage[],
    startIndex?: number,
  ) => void;
  openAccommodationDetail: (item: Option) => void;
  openVoteModal: (optionId: string) => void;
  revealAccommodationOnMap: (item: Option) => void;
  toggleCompare: (optionId: string) => void;
  onVote: (optionId: string, value: "up" | "down") => void;
  toggleBooked: (item: Option) => void;
  toggleNoLongerAvailable: (item: Option) => void;
  onStartEditing: (item: Option) => void;
  onDelete: (optionId: string) => void;
  openCommentModal: (optionId: string) => void;
};

export function AccommodationsOptionsListSection(props: Props) {
  const {
    isLoading,
    optionsForList,
    voteExtremes,
    highlightedCardId,
    nights,
    peopleCount,
    rubPerUsd,
    tripRequirements,
    commentsByOption,
    canCollaborate,
    selectedIds,
    openGallery,
    openAccommodationDetail,
    openVoteModal,
    revealAccommodationOnMap,
    toggleCompare,
    onVote,
    toggleBooked,
    toggleNoLongerAvailable,
    onStartEditing,
    onDelete,
    openCommentModal,
  } = props;

  return (
    <section
      className="grid gap-3"
      aria-busy={isLoading}
      aria-label={isLoading ? "Загрузка списка жилья" : undefined}
    >
      {isLoading
        ? Array.from({ length: 4 }).map((_, skeletonIndex) => (
            <div
              key={`acc-sk-${skeletonIndex}`}
              className="rounded-2xl border border-border/55 bg-muted/15 p-4 sm:p-5"
              style={lvStaggerStyle(skeletonIndex, 70)}
            >
              <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-start">
                <div className="h-44 rounded-lg bg-muted/50 motion-safe:animate-pulse motion-reduce:bg-muted/40" />
                <div className="space-y-3">
                  <div className="h-7 max-w-[min(100%,22rem)] rounded-md bg-muted/45 motion-safe:animate-pulse" />
                  <div className="h-4 w-full max-w-xl rounded-md bg-muted/38 motion-safe:animate-pulse" />
                  <div className="h-4 w-[72%] max-w-lg rounded-md bg-muted/33 motion-safe:animate-pulse" />
                </div>
              </div>
            </div>
          ))
        : optionsForList.map((item, listIndex) => {
            const voteBalance = voteExtremes.byId.get(item.id) ?? 0;
            const isTopVoted =
              voteExtremes.hasExtremes && voteBalance === voteExtremes.max;
            const isLowVoted =
              voteExtremes.hasExtremes && voteBalance === voteExtremes.min;

            return (
              <AccommodationOptionCard
                key={item.id}
                item={item}
                listIndex={listIndex}
                highlighted={highlightedCardId === item.id}
                isTopVoted={isTopVoted}
                isLowVoted={isLowVoted}
                nights={nights}
                peopleCount={peopleCount}
                rubPerUsd={rubPerUsd}
                tripRequirements={tripRequirements}
                comments={commentsByOption[item.id] ?? []}
                canCollaborate={canCollaborate}
                selectedIds={selectedIds}
                openGallery={openGallery}
                openAccommodationDetail={openAccommodationDetail}
                openVoteModal={openVoteModal}
                revealAccommodationOnMap={revealAccommodationOnMap}
                toggleCompare={toggleCompare}
                onVote={onVote}
                toggleBooked={toggleBooked}
                toggleNoLongerAvailable={toggleNoLongerAvailable}
                onStartEditing={onStartEditing}
                onDelete={onDelete}
                openCommentModal={openCommentModal}
              />
            );
          })}
    </section>
  );
}
