"use client";

import { Button } from "@/components/ui/button";
import {
  formatCommentTimestamp,
  getLatestComment,
} from "../../lib/comment-helpers";
import type { AccommodationCommentRow, Option } from "../../lib/types";

type Props = {
  item: Option;
  comments: AccommodationCommentRow[];
  canCollaborate: boolean;
  openAccommodationDetail: (item: Option) => void;
  openCommentModal: (optionId: string) => void;
};

export function OptionCardCommentsPreview({
  item,
  comments,
  canCollaborate,
  openAccommodationDetail,
  openCommentModal,
}: Props) {
  const latestComment = getLatestComment(comments);

  return (
    <div className="mt-4 rounded-lg border border-border/60 bg-muted/5 px-3 py-2.5 dark:border-border/80">
      <div className="flex items-start justify-between gap-2 max-md:flex-col">
        <div className="min-w-0 flex-1 max-md:w-full">
          <p className="text-sm font-medium">
            Комментарии участников{" "}
            <span className="text-xs tabular-nums text-muted-foreground">
              ({comments.length})
            </span>
          </p>
          {latestComment?.body.trim() ? (
            <p className="line-clamp-1 wrap-anywhere text-xs text-muted-foreground">
              {latestComment.authorName}: {latestComment.body} ·{" "}
              {formatCommentTimestamp(latestComment.createdAt)}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {canCollaborate
                ? "Обсуждение открывается в подробном виде карточки."
                : "Пока нет комментариев."}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start max-md:w-full max-md:*:flex-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="max-md:min-h-9"
            onClick={() => openAccommodationDetail(item)}
          >
            Обсуждение
          </Button>
          {canCollaborate ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="max-md:min-h-9"
              onClick={() => openCommentModal(item.id)}
            >
              Добавить
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
