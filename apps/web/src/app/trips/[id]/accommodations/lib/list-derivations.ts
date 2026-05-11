import type { Option } from "./types";

export function sortOptionsBookedFirst(options: Option[]): Option[] {
  const booked = options.filter((item) => item.status === "booked");
  const others = options.filter((item) => item.status !== "booked");
  return [...booked, ...others];
}

export function computeVoteBalanceExtremes(options: Option[]): {
  byId: Map<string, number>;
  max: number;
  min: number;
  hasExtremes: boolean;
} {
  const byId = new Map<string, number>();
  let max = Number.NEGATIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const item of options) {
    const balance = item.upVotes - item.downVotes;
    byId.set(item.id, balance);
    if (balance > max) max = balance;
    if (balance < min) min = balance;
  }
  const hasExtremes =
    options.length > 1 &&
    Number.isFinite(max) &&
    Number.isFinite(min) &&
    max > min;
  return { byId, max, min, hasExtremes };
}
