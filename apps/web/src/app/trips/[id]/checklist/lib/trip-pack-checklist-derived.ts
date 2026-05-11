import { buildVisiblePackRows, type PackItemView } from "./pack-layout";

/** Число строк (line) с parentItemId = id секции */
export function packLineCountBySectionId(
  items: PackItemView[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (item.kind !== "line" || !item.parentItemId) continue;
    map.set(item.parentItemId, (map.get(item.parentItemId) ?? 0) + 1);
  }
  return map;
}

export function packVisibleRowsFiltered(
  items: PackItemView[],
  opts: { collapsedSectionIds: Set<string>; filterNorm: string },
): PackItemView[] {
  return buildVisiblePackRows(items, opts);
}
