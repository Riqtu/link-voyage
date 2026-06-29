import type { Libraries } from "@react-google-maps/api";

/** Библиотека разрешает один вызов `useJsApiLoader` с одинаковыми опциями глобально. */
export const GOOGLE_MAPS_JS_LOADER_ID = "link-voyage-google-maps-js";

export const GOOGLE_MAP_MARKER_LIBRARY: Libraries = ["marker", "places"];

export const GOOGLE_MAP_PLACES_LIBRARY: Libraries = ["places"];

/** Пустая строка из build-arg/env не заменяется `??` — считаем её отсутствием Map ID. */
export function resolvePublicGoogleMapId(): string | null {
  const raw = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID?.trim();
  if (!raw || raw === "DEMO_MAP_ID") return null;
  return raw;
}

export function googleMapsLoaderLibraries(
  mapId: string | null,
): Libraries {
  return mapId ? GOOGLE_MAP_MARKER_LIBRARY : GOOGLE_MAP_PLACES_LIBRARY;
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
  if (/ApiTargetBlockedMapError/i.test(message)) {
    return "Ключ Google Maps не разрешён для этого домена. В Google Cloud Console добавьте сайт в ограничения HTTP referrer и включите Maps JavaScript API.";
  }
  if (/InvalidKeyMapError|ApiNotActivatedMapError/i.test(message)) {
    return "Неверный или неактивированный ключ Google Maps. Проверьте API key и включённые API в Google Cloud Console.";
  }
  return "Не удалось загрузить Google Maps.";
}
