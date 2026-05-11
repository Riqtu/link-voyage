import type { AccommodationPreviewImage } from "@/lib/trpc";
import type { ChangeEvent, Dispatch, FormEvent, SetStateAction } from "react";
import type { GeocodeResult, ModalCurrency } from "../../lib/types";

export type LatLng = { lat: number; lng: number };

export type AccommodationFormModalProps = {
  open: boolean;
  editingId: string | null;
  resetForm: () => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  title: string;
  setTitle: Dispatch<SetStateAction<string>>;
  provider: string;
  setProvider: Dispatch<SetStateAction<string>>;
  pricingMode: "total" | "perNight" | "perPerson";
  setPricingMode: Dispatch<SetStateAction<"total" | "perNight" | "perPerson">>;
  sourceUrl: string;
  setSourceUrl: Dispatch<SetStateAction<string>>;
  previewBusy: boolean;
  geminiBusy: boolean;
  onFetchPreview: () => Promise<void>;
  onGeminiEnrich: () => Promise<void>;
  geminiHtmlDraft: string;
  setGeminiHtmlDraft: Dispatch<SetStateAction<string>>;
  onGeminiEnrichFromHtml: () => Promise<void>;
  locationLabel: string;
  setLocationLabel: Dispatch<SetStateAction<string>>;
  setGeocodeResults: Dispatch<SetStateAction<GeocodeResult[]>>;
  geocodeBusy: boolean;
  onGeocodeSearch: () => Promise<void>;
  geocodeResults: GeocodeResult[];
  setSelectedCoords: Dispatch<SetStateAction<LatLng | null>>;
  latInput: string;
  setLatInput: Dispatch<SetStateAction<string>>;
  lngInput: string;
  setLngInput: Dispatch<SetStateAction<string>>;
  selectedCoords: LatLng | null;
  mapCenter: LatLng;
  previewDescription: string;
  setPreviewDescription: Dispatch<SetStateAction<string>>;
  previewImages: AccommodationPreviewImage[];
  setPreviewImages: Dispatch<SetStateAction<AccommodationPreviewImage[]>>;
  uploadBusy: boolean;
  galleryGeminiBusy: boolean;
  onUploadImages: (event: ChangeEvent<HTMLInputElement>) => void;
  manualImageUrlDraft: string;
  setManualImageUrlDraft: Dispatch<SetStateAction<string>>;
  manualImageZoneDraft: string;
  setManualImageZoneDraft: Dispatch<SetStateAction<string>>;
  addPreviewImageFromUrl: () => void;
  galleryHtmlDraft: string;
  setGalleryHtmlDraft: Dispatch<SetStateAction<string>>;
  onGalleryGeminiFromHtml: () => Promise<void>;
  price: string;
  setPrice: Dispatch<SetStateAction<string>>;
  currency: ModalCurrency;
  setCurrency: Dispatch<SetStateAction<ModalCurrency>>;
  formUsdToRubTotal: number | null;
  peopleCount: number;
  rating: string;
  setRating: Dispatch<SetStateAction<string>>;
  freeCancellation: boolean;
  setFreeCancellation: Dispatch<SetStateAction<boolean>>;
  amenitiesInput: string;
  setAmenitiesInput: Dispatch<SetStateAction<string>>;
  notes: string;
  setNotes: Dispatch<SetStateAction<string>>;
  formatRubAmount: (amount: number) => string;
};

/** Внутренняя панель без оболочки `fixed`/backdrop */
export type AccommodationFormModalPanelProps = Omit<
  AccommodationFormModalProps,
  "open"
>;
