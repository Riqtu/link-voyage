/** Минимальные типы под Places API (importLibrary), без жёсткой зависимости от @types/google.maps */

export type PlacePhotoLike = {
  getURI?(options?: { maxWidthPx?: number; maxHeightPx?: number }): string;
  getUrl?(options?: { maxWidth?: number; maxHeight?: number }): string;
  uri?: string;
  url?: string;
};

export type PlaceLike = {
  displayName?: { text?: string };
  formattedAddress?: string;
  photos?: PlacePhotoLike[];
  fetchFields(request: { fields: string[] }): Promise<void>;
};

export type PlaceConstructor = new (options: {
  id: string;
  requestedLanguage?: string;
}) => PlaceLike & {
  constructor: {
    searchByText(request: {
      textQuery?: string;
      fields: string[];
      language?: string;
      maxResultCount?: number;
    }): Promise<{ places: PlaceLike[] }>;
  };
};

export type PlacesLibraryLike = {
  Place?: PlaceConstructor;
};
