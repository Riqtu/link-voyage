"use client";

import { getAuthToken } from "@/lib/auth-token";
import type { useRouter } from "next/navigation";
import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { PackItemView } from "../lib/pack-layout";
import * as remote from "../lib/trip-pack-checklist-remote";

export type BulkWorkingKey =
  | null
  | "all_on"
  | "all_off"
  | `section:${string}:on`
  | `section:${string}:off`;

export type UseTripPackChecklistSyncArgs = {
  tripId: string;
  router: ReturnType<typeof useRouter>;
  setItems: Dispatch<SetStateAction<PackItemView[]>>;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  setTripTitle: Dispatch<SetStateAction<string | null>>;
  setIsLoading: Dispatch<SetStateAction<boolean>>;
  setBulkWorking: Dispatch<SetStateAction<BulkWorkingKey>>;
};

export function useTripPackChecklistSync(d: UseTripPackChecklistSyncArgs) {
  const {
    tripId,
    router,
    setItems,
    setLoadError,
    setTripTitle,
    setIsLoading,
    setBulkWorking,
  } = d;

  const load = useCallback(async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const { tripTitle: title, items: nextItems } =
        await remote.remoteLoadTripAndPackItems(tripId);
      setTripTitle(title);
      setItems(nextItems);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось загрузить чеклист",
      );
    } finally {
      setIsLoading(false);
    }
  }, [router, tripId, setLoadError, setTripTitle, setItems, setIsLoading]);

  const refreshChecklist = useCallback(async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    setLoadError(null);
    try {
      const nextItems = await remote.remoteListPackItems(tripId);
      setItems(nextItems);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось обновить список",
      );
    }
  }, [router, tripId, setLoadError, setItems]);

  const reorderPeers = useCallback(
    async (parentSectionId: string | null, orderedItemIds: string[]) => {
      setLoadError(null);
      try {
        const nextItems = await remote.remotePackReorderPeers(
          tripId,
          parentSectionId,
          orderedItemIds,
        );
        setItems(nextItems);
      } catch (e) {
        setLoadError(
          e instanceof Error ? e.message : "Не удалось изменить порядок",
        );
      }
    },
    [tripId, setItems, setLoadError],
  );

  async function bulkSetLinesDone(
    done: boolean,
    scope: "all_lines" | "section_lines",
    sectionItemId?: string,
  ) {
    const key =
      scope === "all_lines"
        ? done
          ? "all_on"
          : "all_off"
        : done
          ? (`section:${sectionItemId}:on` as const)
          : (`section:${sectionItemId}:off` as const);
    setBulkWorking(key);
    setLoadError(null);
    try {
      const nextItems = await remote.remotePackBulkSetLinesDone(tripId, {
        done,
        scope,
        ...(scope === "section_lines" ? { sectionItemId } : {}),
      });
      setItems(nextItems);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось обновить отметки",
      );
    } finally {
      setBulkWorking(null);
    }
  }

  return {
    load,
    refreshChecklist,
    reorderPeers,
    bulkSetLinesDone,
  };
}
