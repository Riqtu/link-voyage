import { getApiClient } from "@/lib/api-client";
import type { PackItemView } from "./pack-layout";
import type { RestorePackOrdered } from "./page-helpers";

type AddKind = "line" | "group";

export async function remoteLoadTripAndPackItems(tripId: string): Promise<{
  tripTitle: string;
  items: PackItemView[];
}> {
  const api = getApiClient();
  const [trip, checklist] = await Promise.all([
    api.trip.byId.query({ tripId }),
    api.trip.packChecklist.list.query({ tripId }),
  ]);
  return { tripTitle: trip.title, items: checklist.items };
}

export async function remoteListPackItems(
  tripId: string,
): Promise<PackItemView[]> {
  const api = getApiClient();
  const checklist = await api.trip.packChecklist.list.query({ tripId });
  return checklist.items;
}

export async function remotePackAddItem(
  tripId: string,
  args: {
    title: string;
    kind: AddKind;
    parentItemId?: string;
    quantity?: number;
    quantityUnit?: string;
  },
): Promise<void> {
  const api = getApiClient();
  await api.trip.packChecklist.addItem.mutate({
    tripId,
    title: args.title,
    kind: args.kind,
    ...(args.parentItemId ? { parentItemId: args.parentItemId } : {}),
    ...(args.kind === "line" && args.quantity != null
      ? { quantity: args.quantity }
      : {}),
    ...(args.kind === "line" &&
    args.quantity != null &&
    args.quantityUnit &&
    args.quantityUnit.length > 0
      ? { quantityUnit: args.quantityUnit }
      : {}),
  });
}

export async function remotePackUpdateItemDone(
  tripId: string,
  itemId: string,
  done: boolean,
): Promise<void> {
  const api = getApiClient();
  await api.trip.packChecklist.updateItem.mutate({ tripId, itemId, done });
}

export async function remotePackUpdateItemGroupTitle(
  tripId: string,
  itemId: string,
  title: string,
): Promise<void> {
  const api = getApiClient();
  await api.trip.packChecklist.updateItem.mutate({ tripId, itemId, title });
}

export async function remotePackUpdateItemLineFields(
  tripId: string,
  itemId: string,
  title: string,
  quantity: number | null,
  quantityUnit: string | null,
): Promise<void> {
  const api = getApiClient();
  await api.trip.packChecklist.updateItem.mutate({
    tripId,
    itemId,
    title,
    quantity,
    quantityUnit,
  });
}

export async function remotePackResetFromPreset(
  tripId: string,
): Promise<PackItemView[]> {
  const api = getApiClient();
  const { items } = await api.trip.packChecklist.resetFromPreset.mutate({
    tripId,
  });
  return items;
}

export async function remotePackRemoveItem(
  tripId: string,
  itemId: string,
): Promise<void> {
  const api = getApiClient();
  await api.trip.packChecklist.removeItem.mutate({ tripId, itemId });
}

export async function remotePackRestoreBatch(
  tripId: string,
  ordered: RestorePackOrdered,
): Promise<PackItemView[]> {
  const api = getApiClient();
  const { items } =
    await api.trip.packChecklist.restoreDeletedItemsBatch.mutate({
      tripId,
      ordered,
    });
  return items;
}

export async function remotePackReorderPeers(
  tripId: string,
  parentSectionId: string | null,
  orderedItemIds: string[],
): Promise<PackItemView[]> {
  const api = getApiClient();
  const { items } = await api.trip.packChecklist.reorderPeers.mutate({
    tripId,
    parentSectionId: parentSectionId ?? null,
    orderedItemIds,
  });
  return items;
}

export async function remotePackBulkSetLinesDone(
  tripId: string,
  opts: {
    done: boolean;
    scope: "all_lines" | "section_lines";
    sectionItemId?: string;
  },
): Promise<PackItemView[]> {
  const api = getApiClient();
  const { items } = await api.trip.packChecklist.bulkSetLinesDone.mutate({
    tripId,
    done: opts.done,
    scope: opts.scope,
    ...(opts.scope === "section_lines" && opts.sectionItemId
      ? { sectionItemId: opts.sectionItemId }
      : {}),
  });
  return items;
}
