"use client";

import { Button } from "@/components/ui/button";
import { Trash2, User } from "lucide-react";
import type { Option } from "../../lib/types";
import type { AccommodationDetailSharedProps } from "./types";

type Props = { option: Option } & Pick<
  AccommodationDetailSharedProps,
  "comments" | "canCollaborate" | "onOpenCommentModal" | "onDeleteComment"
>;

export function DetailComments(props: Props) {
  const {
    option,
    comments,
    canCollaborate,
    onOpenCommentModal,
    onDeleteComment,
  } = props;

  return (
    <div className="mt-6 rounded-xl border bg-muted/15 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <p className="text-sm font-medium">Комментарии участников</p>
          {comments.length > 0 ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {comments.length}
            </span>
          ) : null}
        </div>
        {canCollaborate ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0"
            onClick={() => onOpenCommentModal(option.id)}
          >
            Добавить комментарий
          </Button>
        ) : null}
      </div>
      {comments.length === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          Пока нет комментариев.
        </p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-3 overflow-y-auto pr-1">
          {comments.map((c) => (
            <li
              key={c.id}
              className="flex gap-2 rounded-lg border border-border/60 bg-card px-2 py-2 text-sm"
            >
              <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                {c.authorAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.authorAvatarUrl}
                    alt=""
                    className="absolute inset-0 size-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-muted-foreground">
                    <User className="size-4" aria-hidden />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <span className="font-medium">{c.authorName}</span>
                  <time
                    className="shrink-0 text-[11px] text-muted-foreground"
                    dateTime={c.createdAt}
                  >
                    {new Date(c.createdAt).toLocaleString("ru-RU", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
                <p className="mt-1 whitespace-pre-wrap wrap-break-words text-muted-foreground">
                  {c.body}
                </p>
              </div>
              {c.canDelete ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 self-start text-muted-foreground hover:text-destructive"
                  title="Удалить комментарий"
                  aria-label="Удалить комментарий"
                  onClick={() => void onDeleteComment(c.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
