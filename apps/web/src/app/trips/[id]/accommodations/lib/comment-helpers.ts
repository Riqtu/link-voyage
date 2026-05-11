import type { AccommodationCommentRow } from "./types";

export function getLatestComment(
  comments: AccommodationCommentRow[],
): AccommodationCommentRow | null {
  if (comments.length === 0) return null;
  return comments.reduce((latest, current) =>
    new Date(current.createdAt).getTime() > new Date(latest.createdAt).getTime()
      ? current
      : latest,
  );
}

export function formatCommentTimestamp(dateIso: string): string {
  return new Date(dateIso).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
