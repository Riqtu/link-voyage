"use client";

import type { Libraries } from "@react-google-maps/api";
import { useEffect, useState } from "react";

/** Библиотека разрешает один вызов `useJsApiLoader` с одинаковыми опциями глобально. */
export const GOOGLE_MAPS_JS_LOADER_ID = "link-voyage-google-maps-js";

/** Всегда один набор — иначе при переходах между экранами побеждает первый loader и ломаются маркеры. */
export const GOOGLE_MAP_LOADER_LIBRARIES: Libraries = ["marker", "places"];

/** @deprecated Используйте GOOGLE_MAP_LOADER_LIBRARIES */
export const GOOGLE_MAP_MARKER_LIBRARY: Libraries = GOOGLE_MAP_LOADER_LIBRARIES;

/** @deprecated Используйте GOOGLE_MAP_LOADER_LIBRARIES */
export const GOOGLE_MAP_PLACES_LIBRARY: Libraries = GOOGLE_MAP_LOADER_LIBRARIES;

/** Пустая строка из build-arg/env не заменяется `??` — считаем её отсутствием Map ID. */
export function resolvePublicGoogleMapId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim();
  if (!raw || raw === "DEMO_MAP_ID") return null;
  return raw;
}

export function googleMapsLoaderLibraries(
  _mapId: string | null,
): Libraries {
  return GOOGLE_MAP_LOADER_LIBRARIES;
}

export function withGoogleMapId<T extends google.maps.MapOptions>(
  options: T,
  mapId: string | null,
): T {
  if (!mapId) return options;
  return { ...options, mapId };
}

export function googleMapsLoadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const host =
    typeof window !== "undefined" ? window.location.hostname : "ваш-домен";
  if (/ApiTargetBlockedMapError/i.test(message)) {
    return `Ключ Google Maps не разрешён для ${host}. В Google Cloud Console → Credentials добавьте в HTTP referrers: https://${host}/* и включите Maps JavaScript API.`;
  }
  if (/InvalidKeyMapError|ApiNotActivatedMapError/i.test(message)) {
    return "Неверный или неактивированный ключ Google Maps. Проверьте API key и включённые API в Google Cloud Console.";
  }
  return "Не удалось загрузить Google Maps.";
}

export function googleMapsAuthFailureMessage(): string {
  const host =
    typeof window !== "undefined" ? window.location.hostname : "ваш-домен";
  return `Google Maps отклонил ключ на ${host}. Добавьте https://${host}/* в ограничения HTTP referrer ключа и пересоберите web, если меняли NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.`;
}

/** Срабатывает при ApiTargetBlockedMapError / InvalidKey — скрипт грузится, карта падает позже. */
export function useGoogleMapsAuthFailure(): boolean {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const prev = window.gm_authFailure;
    window.gm_authFailure = () => {
      setFailed(true);
      prev?.();
    };
    return () => {
      window.gm_authFailure = prev;
    };
  }, []);

  return failed;
}
