import { Types } from 'mongoose';
import { coercePackKind } from '../../trips/pack-checklist-tree';

export function mapPackChecklistItem(sub: {
  _id: Types.ObjectId;
  title: string;
  done: boolean;
  sortOrder: number;
  kind?: 'line' | 'group';
  parentItemId?: Types.ObjectId;
  quantity?: number;
  quantityUnit?: string;
}) {
  const q =
    typeof sub.quantity === 'number' &&
    Number.isFinite(sub.quantity) &&
    coercePackKind(sub) === 'line'
      ? sub.quantity
      : null;
  const u =
    typeof sub.quantityUnit === 'string'
      ? sub.quantityUnit.trim() || null
      : null;
  return {
    id: sub._id.toString(),
    kind: coercePackKind(sub),
    title: sub.title,
    done: Boolean(sub.done),
    sortOrder: sub.sortOrder,
    parentItemId: sub.parentItemId?.toString() ?? null,
    quantity: q,
    quantityUnit: q != null ? u : null,
  };
}
