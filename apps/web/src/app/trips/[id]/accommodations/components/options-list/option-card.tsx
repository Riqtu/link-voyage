"use client";

import { lvStaggerStyle } from "@/lib/lv-motion";
import type { AccommodationPreviewImage } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { AccommodationCommentRow, Option } from "../../lib/types";
import { OptionCardCommentsPreview } from "./option-card-comments-preview";
import { OptionCardHeader } from "./option-card-header";
import { OptionCardImageColumn } from "./option-card-image-column";
import { OptionCardPricingBlock } from "./option-card-pricing-block";
import { OptionCardToolbar } from "./option-card-toolbar";

export type AccommodationOptionCardProps = {
  item: Option;
  listIndex: number;
  highlighted: boolean;
  isTopVoted: boolean;
  isLowVoted: boolean;
  nights: number;
  peopleCount: number;
  rubPerUsd: number | null;
  tripRequirements: string[];
  comments: AccommodationCommentRow[];
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

export function AccommodationOptionCard(props: AccommodationOptionCardProps) {
  const {
    item,
    listIndex,
    highlighted,
    isTopVoted,
    isLowVoted,
    nights,
    peopleCount,
    rubPerUsd,
    tripRequirements,
    comments,
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
    <article
      id={`lv-accommodation-card-${item.id}`}
      style={lvStaggerStyle(listIndex)}
      className={cn(
        "scroll-mt-24 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-[box-shadow,opacity] duration-500 dark:border-border/80 sm:p-5",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:zoom-in-95 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:ease-out",
        item.noLongerAvailable && "opacity-[0.55]",
        isTopVoted && "border-emerald-500/55 dark:border-emerald-500/45",
        isLowVoted && "border-rose-500/55 dark:border-rose-500/45",
        highlighted &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
    >
      <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-start">
        <OptionCardImageColumn item={item} openGallery={openGallery} />
        <div>
          <OptionCardHeader
            item={item}
            isTopVoted={isTopVoted}
            isLowVoted={isLowVoted}
            openAccommodationDetail={openAccommodationDetail}
            openVoteModal={openVoteModal}
          />

          <OptionCardPricingBlock
            item={item}
            nights={nights}
            peopleCount={peopleCount}
            rubPerUsd={rubPerUsd}
            tripRequirements={tripRequirements}
          />

          <OptionCardToolbar
            item={item}
            canCollaborate={canCollaborate}
            selectedIds={selectedIds}
            revealAccommodationOnMap={revealAccommodationOnMap}
            toggleCompare={toggleCompare}
            onVote={onVote}
            toggleBooked={toggleBooked}
            toggleNoLongerAvailable={toggleNoLongerAvailable}
            onStartEditing={onStartEditing}
            onDelete={onDelete}
          />

          <OptionCardCommentsPreview
            item={item}
            comments={comments}
            canCollaborate={canCollaborate}
            openAccommodationDetail={openAccommodationDetail}
            openCommentModal={openCommentModal}
          />
        </div>
      </div>
    </article>
  );
}
