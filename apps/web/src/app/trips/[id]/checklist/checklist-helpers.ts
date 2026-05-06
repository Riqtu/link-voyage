export type PackItemView = {
  id: string;
  kind: "line" | "group";
  title: string;
  done: boolean;
  sortOrder: number;
  parentItemId: string | null;
  quantity: number | null;
  quantityUnit: string | null;
};

function hasValidGroupParent(items: PackItemView[], n: PackItemView): boolean {
  if (!n.parentItemId) return false;
  const p = items.find((x) => x.id === n.parentItemId);
  return Boolean(p && p.kind === "group");
}

function isEffectivePackRoot(items: PackItemView[], n: PackItemView): boolean {
  if (!n.parentItemId) return true;
  if (!hasValidGroupParent(items, n)) return true;
  return false;
}

function cmpPackItem(a: PackItemView, b: PackItemView): number {
  return (
    a.sortOrder - b.sortOrder ||
    a.title.localeCompare(b.title, "ru", { sensitivity: "base" })
  );
}

export function packPeersForReorder(
  items: PackItemView[],
  target: PackItemView,
): PackItemView[] {
  if (
    target.kind === "line" &&
    target.parentItemId &&
    hasValidGroupParent(items, target)
  ) {
    const pid = target.parentItemId;
    return items
      .filter(
        (n) => n.kind === "line" && n.parentItemId && n.parentItemId === pid,
      )
      .sort(cmpPackItem);
  }
  return items.filter((n) => isEffectivePackRoot(items, n)).sort(cmpPackItem);
}

export function collectDescendantPackIds(
  items: PackItemView[],
  rootId: string,
): Set<string> {
  const byParent = new Map<string | null, PackItemView[]>();
  for (const n of items) {
    const pk = n.parentItemId;
    const list = byParent.get(pk) ?? [];
    list.push(n);
    byParent.set(pk, list);
  }
  const out = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const kids = byParent.get(id) ?? [];
    for (const k of kids) stack.push(k.id);
  }
  return out;
}

function lineSearchBlob(row: PackItemView): string {
  const qty =
    row.quantity != null
      ? `${row.quantity}${row.quantityUnit ? `\u00a0${row.quantityUnit}` : ""}`
      : "";
  return `${row.title}${qty ? ` ${qty}` : ""}`.toLowerCase();
}

function sectionHasLineMatch(
  items: PackItemView[],
  sectionId: string,
  fk: string,
): boolean {
  return items.some(
    (r) =>
      r.kind === "line" &&
      r.parentItemId === sectionId &&
      lineSearchBlob(r).includes(fk),
  );
}

/** Список для отображения: свёрнутые секции и поиск. */
export function buildVisiblePackRows(
  items: PackItemView[],
  options: {
    collapsedSectionIds: ReadonlySet<string>;
    filterNorm: string;
  },
): PackItemView[] {
  const fk = options.filterNorm.trim().toLowerCase();
  const out: PackItemView[] = [];

  if (!fk) {
    let skipUnder: string | null = null;
    for (const row of items) {
      if (row.kind === "group") {
        out.push(row);
        skipUnder = options.collapsedSectionIds.has(row.id) ? row.id : null;
        continue;
      }
      if (
        row.kind === "line" &&
        row.parentItemId &&
        skipUnder === row.parentItemId
      ) {
        continue;
      }
      out.push(row);
    }
    return out;
  }

  for (const row of items) {
    if (row.kind === "group") {
      const head =
        row.title.toLowerCase().includes(fk) ||
        sectionHasLineMatch(items, row.id, fk);
      if (!head) continue;
      out.push(row);
      continue;
    }
    if (!lineSearchBlob(row).includes(fk)) continue;
    out.push(row);
  }
  return out;
}

export type PackRenderBlock =
  | { type: "section"; group: PackItemView; lines: PackItemView[] }
  | { type: "rootLine"; row: PackItemView };

/** Блоки отрисовки: корневые строки и секции с дочерними строками (по порядку в списке). */
export function buildPackRenderBlocks(
  items: PackItemView[],
): PackRenderBlock[] {
  const roots = items
    .filter((n) => isEffectivePackRoot(items, n))
    .sort(cmpPackItem);
  const blocks: PackRenderBlock[] = [];
  for (const r of roots) {
    if (r.kind === "group") {
      const lines = items
        .filter((l) => l.kind === "line" && l.parentItemId === r.id)
        .sort(cmpPackItem);
      blocks.push({ type: "section", group: r, lines });
    } else {
      blocks.push({ type: "rootLine", row: r });
    }
  }
  return blocks;
}

/** Родитель для reorder peers: null — корень, иначе id секции. */
export function packReorderParentKey(
  items: PackItemView[],
  row: PackItemView,
): string | null {
  if (row.kind === "group") return null;
  if (row.kind === "line" && row.parentItemId) {
    const p = items.find((i) => i.id === row.parentItemId);
    if (p?.kind === "group") return row.parentItemId;
  }
  return null;
}

export function sectionLineProgress(
  items: PackItemView[],
  sectionId: string,
): { done: number; total: number } {
  let total = 0;
  let done = 0;
  for (const r of items) {
    if (r.kind !== "line" || r.parentItemId !== sectionId) continue;
    total += 1;
    if (r.done) done += 1;
  }
  return { done, total };
}

/** Есть хотя бы одна строка и все отмечены как выполненные. */
export function sectionLinesAllComplete(prog: {
  done: number;
  total: number;
}): boolean {
  return prog.total > 0 && prog.done === prog.total;
}
