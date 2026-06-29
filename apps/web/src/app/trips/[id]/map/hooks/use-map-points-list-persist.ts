"use client";

import { useCallback, useEffect, useState } from "react";

/** Сессионное сохранение «открыта ли нижняя панель со списком точек». */
export function useMapPointsListPersist(tripId: string) {
  const [pointsListOpen, setPointsListOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`lv-map-points-list-open-${tripId}`);
      if (stored === "1") setPointsListOpen(true);
      else if (stored === "0") setPointsListOpen(false);
    } catch {
      /* private mode */
    }
  }, [tripId]);

  const togglePointsList = useCallback(() => {
    setPointsListOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(
          `lv-map-points-list-open-${tripId}`,
          next ? "1" : "0",
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [tripId]);

  return { pointsListOpen, togglePointsList };
}
