import type {
  PlaceLike,
  PlacePhotoLike,
  PlacesLibraryLike,
} from "./places-shim-types";

export type GooglePlacePreviewPatch = {
  title?: string;
  /** Подставляются в описание последовательно через merge `prev || line` */
  descriptionHints: string[];
  imageUrl?: string;
};

function getPhotoUrl(photo?: PlacePhotoLike): string | undefined {
  return (
    photo?.getURI?.({
      maxWidthPx: 1200,
      maxHeightPx: 800,
    }) ??
    photo?.getUrl?.({
      maxWidth: 1200,
      maxHeight: 800,
    }) ??
    photo?.uri ??
    photo?.url
  );
}

/**
 * Безопасное обогащение карточки точки через Places API (фото и текст).
 * Ошибки API глотаются — геокод остаётся рабочим.
 */
export async function fetchGooglePlacePreviewPatch(
  placeId: string,
): Promise<GooglePlacePreviewPatch | null> {
  if (
    typeof window === "undefined" ||
    !placeId.trim() ||
    !window.google?.maps
  ) {
    return null;
  }

  try {
    const placesLib = (await google.maps.importLibrary(
      "places",
    )) as PlacesLibraryLike;
    const Place = placesLib.Place;
    if (!Place) return null;

    const patch: GooglePlacePreviewPatch = { descriptionHints: [] };

    const place = new Place({ id: placeId, requestedLanguage: "ru" });
    await place.fetchFields({
      fields: ["displayName", "formattedAddress", "photos"],
    });

    let photoUrl = getPhotoUrl(place.photos?.[0]);
    if (!photoUrl) {
      const PlaceWithSearch = Place as unknown as {
        searchByText(request: {
          textQuery?: string;
          fields: string[];
          language?: string;
          maxResultCount?: number;
        }): Promise<{ places: PlaceLike[] }>;
      };
      const byText = await PlaceWithSearch.searchByText({
        textQuery: place.displayName?.text ?? place.formattedAddress ?? "",
        fields: ["displayName", "formattedAddress", "photos"],
        language: "ru",
        maxResultCount: 1,
      });
      const candidate = byText.places?.[0];
      photoUrl = getPhotoUrl(candidate?.photos?.[0]);
      if (candidate?.displayName?.text) {
        patch.title = candidate.displayName.text;
      }
      if (candidate?.formattedAddress) {
        patch.descriptionHints.push(candidate.formattedAddress);
      }
    }
    if (photoUrl) {
      patch.imageUrl = photoUrl;
    }
    if (place.displayName?.text) {
      patch.title = place.displayName.text;
    }
    if (place.formattedAddress) {
      patch.descriptionHints.push(place.formattedAddress);
    }

    const hasSignal =
      patch.title != null ||
      patch.descriptionHints.length > 0 ||
      patch.imageUrl != null;
    return hasSignal ? patch : null;
  } catch {
    return null;
  }
}
