import { Types } from 'mongoose';
import type { TripPackChecklistItem } from './trip.model';

export type LeanPackRow = {
  _id: Types.ObjectId;
  title: string;
  done?: boolean;
  sortOrder: number;
  kind?: 'line' | 'group';
  parentItemId?: Types.ObjectId;
  quantity?: number;
  quantityUnit?: string;
};

type PackNode = TripPackChecklistItem & { _id: Types.ObjectId };

function cmpOrderTitle(a: PackNode, b: PackNode): number {
  return (
    a.sortOrder - b.sortOrder ||
    a.title.localeCompare(b.title, 'ru', { sensitivity: 'base' })
  );
}

export function coercePackKind(n: {
  kind?: 'line' | 'group';
}): 'line' | 'group' {
  return n.kind === 'group' ? 'group' : 'line';
}

export function hasValidGroupParent(nodes: PackNode[], n: PackNode): boolean {
  const pId = n.parentItemId;
  if (!pId) return false;
  const parent = nodes.find((x) => x._id.equals(pId));
  return Boolean(parent && coercePackKind(parent) === 'group');
}

export function isEffectivePackRoot(nodes: PackNode[], n: PackNode): boolean {
  const pId = n.parentItemId;
  if (!pId) return true;
  if (!hasValidGroupParent(nodes, n)) return true;
  return false;
}

function childrenOf(nodes: PackNode[], parentId: string): PackNode[] {
  return nodes
    .filter(
      (n) =>
        coercePackKind(n) === 'line' &&
        n.parentItemId &&
        n.parentItemId.toString() === parentId,
    )
    .sort(cmpOrderTitle);
}

function sanitizeParents(nodes: PackNode[]): void {
  for (const n of nodes) {
    if (coercePackKind(n) === 'group' && n.parentItemId) {
      n.parentItemId = undefined;
    }
  }
}

export function computeOrderedPack(nodes: PackNode[]): PackNode[] {
  sanitizeParents(nodes);
  const roots = nodes
    .filter((n) => isEffectivePackRoot(nodes, n))
    .sort(cmpOrderTitle);

  const ordered: PackNode[] = [];
  function walkSection(group: PackNode) {
    ordered.push(group);
    childrenOf(nodes, group._id.toString()).forEach((line) =>
      ordered.push(line),
    );
  }

  for (const root of roots) {
    if (coercePackKind(root) === 'group') {
      walkSection(root);
    } else {
      ordered.push(root);
    }
  }

  if (ordered.length !== nodes.length) {
    const seen = new Set(ordered.map((x) => x._id.toString()));
    const rest = nodes.filter((n) => !seen.has(n._id.toString()));
    rest.sort(cmpOrderTitle);
    for (const orphan of rest) {
      orphan.parentItemId = undefined;
      ordered.push(orphan);
    }
  }

  ordered.forEach((n, i) => {
    n.sortOrder = i;
  });

  return ordered;
}

export function applyPackOrderMongoArray(rows: TripPackChecklistItem[]): void {
  const refs = [...rows] as PackNode[];
  const ordered = computeOrderedPack(refs);
  rows.splice(
    0,
    rows.length,
    ...(ordered as unknown as TripPackChecklistItem[]),
  );
}

export function orderLeanRowsForDisplay<T extends LeanPackRow>(rows: T[]): T[] {
  if (!rows.length) return [];
  const copies = rows.map((r) => ({ ...r })) as unknown as PackNode[];
  const ordered = computeOrderedPack(copies);
  return ordered as unknown as T[];
}

export function collectDescendantIdsIncludingSelf(
  nodes: Pick<PackNode, '_id' | 'parentItemId' | 'kind'>[],
  rootId: string,
): Set<string> {
  const byParent = new Map<string | null, typeof nodes>();
  for (const n of nodes) {
    const pk = n.parentItemId?.toString() ?? null;
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
    for (const k of kids) stack.push(k._id.toString());
  }
  return out;
}

/** Соседи по перемещению: строки одной секции или корневые строки и секции вместе. */
export function getPackReorderPeers(
  nodes: PackNode[],
  target: PackNode,
): PackNode[] {
  if (
    coercePackKind(target) === 'line' &&
    target.parentItemId &&
    hasValidGroupParent(nodes, target)
  ) {
    const pid = target.parentItemId.toString();
    return nodes
      .filter(
        (n) =>
          coercePackKind(n) === 'line' &&
          n.parentItemId &&
          n.parentItemId.toString() === pid,
      )
      .sort(cmpOrderTitle);
  }
  return nodes.filter((n) => isEffectivePackRoot(nodes, n)).sort(cmpOrderTitle);
}

/** Поднять или опустить пункт среди своих «слоёв» (корень / строки секции). */
export function swapPackChecklistAdjacentPeer(
  rows: TripPackChecklistItem[],
  itemId: string,
  direction: 'up' | 'down',
): { swapped: boolean } {
  const nodes = [...rows] as PackNode[];
  const target = nodes.find((x) => x._id.toString() === itemId);
  if (!target) {
    return { swapped: false };
  }

  const peers = getPackReorderPeers(nodes, target);
  const j = peers.findIndex((p) => p._id.equals(target._id));
  if (j < 0) {
    return { swapped: false };
  }
  const k = direction === 'up' ? j - 1 : j + 1;
  if (k < 0 || k >= peers.length) {
    return { swapped: false };
  }

  const reordered = [...peers];
  const tmp = reordered[j];
  reordered[j] = reordered[k]!;
  reordered[k] = tmp;
  reordered.forEach((node, idx) => {
    node.sortOrder = idx;
  });

  applyPackOrderMongoArray(rows);
  return { swapped: true };
}

/**
 * Задаёт порядок sortOrder среди соседей (корень или строки одной секции).
 * `parentSectionId === null` — корневые секции и корневые строки.
 */
export function applyPackReorderPeers(
  rows: TripPackChecklistItem[],
  parentSectionId: string | null,
  orderedItemIds: readonly string[],
): { ok: true } | { ok: false; message: string } {
  const nodes = [...rows] as PackNode[];

  let peers: PackNode[];
  if (parentSectionId == null || parentSectionId.trim().length === 0) {
    const firstId = orderedItemIds[0];
    if (!firstId) {
      return { ok: false, message: 'Пустой порядок' };
    }
    const first = nodes.find((n) => n._id.toString() === firstId);
    if (!first) {
      return { ok: false, message: 'Пункт не найден' };
    }
    peers = getPackReorderPeers(nodes, first);
  } else {
    const section = nodes.find((n) => n._id.toString() === parentSectionId);
    if (!section || coercePackKind(section) !== 'group') {
      return { ok: false, message: 'Секция не найдена' };
    }
    peers = nodes
      .filter(
        (n) =>
          coercePackKind(n) === 'line' &&
          n.parentItemId &&
          n.parentItemId.toString() === parentSectionId,
      )
      .sort(cmpOrderTitle);
  }

  const expected = new Set(peers.map((p) => p._id.toString()));
  if (orderedItemIds.length !== expected.size) {
    return { ok: false, message: 'Неверный набор пунктов для порядка' };
  }
  for (const id of orderedItemIds) {
    if (!expected.has(id)) {
      return { ok: false, message: 'Чужой пункт в порядке' };
    }
  }

  for (let i = 0; i < orderedItemIds.length; i++) {
    const id = orderedItemIds[i];
    const node = rows.find((r) => r._id.toString() === id);
    if (!node) {
      return { ok: false, message: 'Пункт не найден' };
    }
    node.sortOrder = i;
  }

  applyPackOrderMongoArray(rows);
  return { ok: true };
}
