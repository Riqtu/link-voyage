import { Types } from 'mongoose';
import { applyPackOrderMongoArray } from './pack-checklist-tree';
import { embedDefaultTripPackChecklist } from './pack-checklist.defaults';
import type { TripDocument, TripPackChecklistItem } from './trip.model';

type PlainPackRow = {
  _id: Types.ObjectId;
  title: string;
  done?: boolean;
  sortOrder?: number;
  kind?: 'line' | 'group';
  parentItemId?: Types.ObjectId;
  quantity?: number;
  quantityUnit?: string;
};

/** Клон плоского чеклиста с новыми _id и перекартированием parentItemId (личная копия). */
export function clonePackChecklistRegenerateIds(
  flat: PlainPackRow[],
): TripPackChecklistItem[] {
  const oldToNew = new Map<string, Types.ObjectId>();
  for (const row of flat) {
    oldToNew.set(row._id.toString(), new Types.ObjectId());
  }

  const out = flat.map((row) => {
    const id = oldToNew.get(row._id.toString())!;
    const parentOld = row.parentItemId?.toString();
    const parentItemId =
      parentOld != null ? oldToNew.get(parentOld) : undefined;

    const kind: 'line' | 'group' = row.kind === 'group' ? 'group' : 'line';

    const base: TripPackChecklistItem = {
      _id: id,
      kind,
      title: row.title,
      done: Boolean(row.done),
      sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : 0,
    };

    if (parentItemId) {
      base.parentItemId = parentItemId;
    }
    if (
      typeof row.quantity === 'number' &&
      Number.isFinite(row.quantity) &&
      kind === 'line'
    ) {
      base.quantity = row.quantity;
      if (
        typeof row.quantityUnit === 'string' &&
        row.quantityUnit.trim().length > 0
      ) {
        base.quantityUnit = row.quantityUnit.trim().slice(0, 12);
      }
    }
    return base;
  });

  return out;
}

function legacySharedRows(trip: TripDocument): PlainPackRow[] | null {
  const raw = trip.packChecklist;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  return [...raw].map((r) => ({
    _id: r._id,
    title: r.title,
    done: Boolean(r.done),
    sortOrder: typeof r.sortOrder === 'number' ? r.sortOrder : 0,
    kind: r.kind === 'group' ? 'group' : 'line',
    parentItemId: r.parentItemId,
    quantity: typeof r.quantity === 'number' ? r.quantity : undefined,
    quantityUnit:
      typeof r.quantityUnit === 'string' ? r.quantityUnit : undefined,
  }));
}

function tryUnsetLegacySharedPackChecklist(trip: TripDocument): boolean {
  const legacy = trip.packChecklist;
  if (!Array.isArray(legacy) || legacy.length === 0) return false;

  const wantIds = trip.members.map((m) => m.userId.toString());
  if (wantIds.length === 0) return false;

  const have = new Set(
    (trip.packChecklistsByMember ?? []).map((p) => p.userId.toString()),
  );
  const allMembersHavePersonal = wantIds.every((id) => have.has(id));
  if (allMembersHavePersonal) {
    trip.packChecklist = undefined;
    trip.markModified('packChecklist');
    return true;
  }
  return false;
}

/**
 * Гарантирует личный чеклист для участника поездки.
 * Если раньше был общий {@link Trip.packChecklist}, каждому при первой выдаче
 * создаётся отдельная копия.
 */
export function ensurePersonalPackOnTrip(
  trip: TripDocument,
  viewerSub: string,
): { items: TripPackChecklistItem[]; needsSave: boolean } {
  if (!Types.ObjectId.isValid(viewerSub)) {
    throw new Error('invalid viewer id');
  }

  if (!Array.isArray(trip.packChecklistsByMember)) {
    trip.packChecklistsByMember = [];
    trip.markModified('packChecklistsByMember');
  }

  const oid = viewerSub;
  const entryExisting = trip.packChecklistsByMember.find(
    (p) => p.userId.toString() === oid,
  );

  if (entryExisting !== undefined) {
    const unset = tryUnsetLegacySharedPackChecklist(trip);
    return {
      items: entryExisting.items,
      needsSave: unset,
    };
  }

  const legacy = legacySharedRows(trip);
  let initialItems: TripPackChecklistItem[];
  if (legacy) {
    initialItems = clonePackChecklistRegenerateIds(legacy);
  } else {
    initialItems = embedDefaultTripPackChecklist();
  }

  applyPackOrderMongoArray(initialItems);
  trip.packChecklistsByMember.push({
    userId: new Types.ObjectId(viewerSub),
    items: initialItems,
  });
  trip.markModified('packChecklistsByMember');
  const added =
    trip.packChecklistsByMember[trip.packChecklistsByMember.length - 1];
  tryUnsetLegacySharedPackChecklist(trip);
  return {
    items: added.items,
    needsSave: true,
  };
}
