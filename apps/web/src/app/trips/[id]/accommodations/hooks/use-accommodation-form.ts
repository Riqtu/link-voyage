import {
  ACCOMMODATION_PREVIEW_IMAGES_MAX,
  MIN_PASTED_LISTING_HTML_CHARS,
} from "@/lib/accommodation-constants";
import { getApiClient } from "@/lib/api-client";
import type { AccommodationPreviewImage } from "@/lib/trpc";
import {
  useCallback,
  useMemo,
  useState,
  type ChangeEvent,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import type { AccommodationFormModalProps } from "../components/form-modal/types";
import { parseAmenitiesFromInput } from "../lib/amenities-parse";
import {
  formatRubAmount,
  isUsdCurrency,
  normalizeModalCurrency,
} from "../lib/page-helpers";
import {
  mergePreviewImageItems,
  sanitizePreviewImagesForSave,
} from "../lib/preview-helpers";
import { calcComparableTotalFromFormPrice } from "../lib/price-calculations";
import type {
  GeminiEnrichmentPayload,
  GeocodeResult,
  ModalCurrency,
  Option,
} from "../lib/types";

export type UseAccommodationFormArgs = {
  tripId: string;
  options: Option[];
  nights: number;
  peopleCount: number;
  rubPerUsd: number | null;
  canCollaborate: boolean;
  setError: Dispatch<SetStateAction<string | null>>;
  loadOptions: () => Promise<void>;
};

export type UseAccommodationFormResult = {
  mapCenter: { lat: number; lng: number };
  /** Для `<AccommodationFormModal open={…} {...modalProps} />` */
  modalProps: Omit<AccommodationFormModalProps, "open">;
  isModalOpen: boolean;
  editingId: string | null;
  openNewVariant: () => void;
  startEditing: (item: Option) => void;
  resetForm: () => void;
};

export function useAccommodationForm({
  tripId,
  options,
  nights,
  peopleCount,
  rubPerUsd,
  canCollaborate,
  setError,
  loadOptions,
}: UseAccommodationFormArgs): UseAccommodationFormResult {
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [price, setPrice] = useState("");
  const [pricingMode, setPricingMode] = useState<
    "total" | "perNight" | "perPerson"
  >("total");
  const [sourceUrl, setSourceUrl] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [selectedCoords, setSelectedCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [latInput, setLatInput] = useState("");
  const [lngInput, setLngInput] = useState("");
  const [previewDescription, setPreviewDescription] = useState("");
  const [previewImages, setPreviewImages] = useState<
    AccommodationPreviewImage[]
  >([]);
  const [manualImageUrlDraft, setManualImageUrlDraft] = useState("");
  const [manualImageZoneDraft, setManualImageZoneDraft] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [geminiHtmlDraft, setGeminiHtmlDraft] = useState("");
  const [currency, setCurrency] = useState<ModalCurrency>("USD");
  const [rating, setRating] = useState("");
  const [freeCancellation, setFreeCancellation] = useState(false);
  const [amenitiesInput, setAmenitiesInput] = useState("");
  const [notes, setNotes] = useState("");
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResult[]>([]);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [galleryGeminiBusy, setGalleryGeminiBusy] = useState(false);
  const [galleryHtmlDraft, setGalleryHtmlDraft] = useState("");

  const mapCenter = useMemo(() => {
    const firstWithCoords = options.find((item) => item.coordinates);
    if (firstWithCoords?.coordinates) {
      return {
        lat: firstWithCoords.coordinates.lat,
        lng: firstWithCoords.coordinates.lng,
      };
    }
    return { lat: 55.751244, lng: 37.618423 };
  }, [options]);

  const formUsdComparableTotal = useMemo(
    () =>
      calcComparableTotalFromFormPrice(price, pricingMode, nights, peopleCount),
    [price, pricingMode, nights, peopleCount],
  );

  const formUsdToRubTotal =
    rubPerUsd !== null &&
    isUsdCurrency(currency.trim()) &&
    formUsdComparableTotal !== null
      ? formUsdComparableTotal * rubPerUsd
      : null;

  const applyGeminiEnrichmentPayload = useCallback(
    (enriched: GeminiEnrichmentPayload) => {
      setTitle(enriched.title);
      setProvider(enriched.provider);
      setSourceUrl(enriched.canonicalUrl);
      if (enriched.locationLabel) {
        setLocationLabel(enriched.locationLabel);
        setGeocodeResults([]);
      }
      if (enriched.coordinates) {
        setSelectedCoords(enriched.coordinates);
        setLatInput(enriched.coordinates.lat.toFixed(6));
        setLngInput(enriched.coordinates.lng.toFixed(6));
      }
      if (enriched.price !== undefined) {
        setPrice(String(enriched.price));
      }
      setPricingMode(enriched.pricingMode);
      setCurrency(normalizeModalCurrency(enriched.currency));
      setRating(enriched.rating !== undefined ? String(enriched.rating) : "");
      setFreeCancellation(enriched.freeCancellation);
      setAmenitiesInput(enriched.amenities.join(", "));
      setNotes(enriched.notes ?? "");
      setPreviewDescription(enriched.previewDescription);
      setPreviewImages(enriched.previewImages.map((url) => ({ url })));
    },
    [],
  );

  const onFetchPreview = useCallback(async () => {
    const raw = sourceUrl.trim();
    if (!raw) {
      setError("Вставьте ссылку на объявление");
      return;
    }
    setPreviewBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      const preview = await api.accommodation.previewFromUrl.mutate({
        url: raw,
      });
      setTitle(preview.title);
      setSourceUrl(preview.canonicalUrl);
      if (preview.siteName) setProvider(preview.siteName);
      setPreviewDescription(preview.description);
      setPreviewImages(preview.images.map((url) => ({ url })));
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Не удалось загрузить превью по ссылке",
      );
    } finally {
      setPreviewBusy(false);
    }
  }, [sourceUrl, setError]);

  const onGeminiEnrich = useCallback(async () => {
    const raw = sourceUrl.trim();
    if (!raw) {
      setError("Вставьте ссылку на объявление");
      return;
    }
    setGeminiBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      const enriched = await api.accommodation.enrichFromGeminiUrl.mutate({
        url: raw,
      });
      applyGeminiEnrichmentPayload(enriched);
    } catch (geminiError) {
      setError(
        geminiError instanceof Error
          ? geminiError.message
          : "Не удалось заполнить карточку через Gemini",
      );
    } finally {
      setGeminiBusy(false);
    }
  }, [applyGeminiEnrichmentPayload, setError, sourceUrl]);

  const onGalleryGeminiFromHtml = useCallback(async () => {
    const html = galleryHtmlDraft.trim();
    if (html.length < MIN_PASTED_LISTING_HTML_CHARS) {
      setError(
        `Вставьте не менее ${MIN_PASTED_LISTING_HTML_CHARS} символов HTML (галерея со страницы)`,
      );
      return;
    }
    setGalleryGeminiBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      const pageUrl = sourceUrl.trim() || undefined;
      const { images } =
        await api.accommodation.galleryZonesFromGeminiHtml.mutate({
          html,
          pageUrl,
        });
      setPreviewImages((prev) => mergePreviewImageItems(prev, images));
    } catch (galleryErr) {
      setError(
        galleryErr instanceof Error
          ? galleryErr.message
          : "Не удалось извлечь фото из HTML",
      );
    } finally {
      setGalleryGeminiBusy(false);
    }
  }, [galleryHtmlDraft, setError, sourceUrl]);

  const onGeminiEnrichFromHtml = useCallback(async () => {
    const html = geminiHtmlDraft.trim();
    if (html.length < MIN_PASTED_LISTING_HTML_CHARS) {
      setError(
        `Вставьте не менее ${MIN_PASTED_LISTING_HTML_CHARS} символов HTML (фрагмент или страница)`,
      );
      return;
    }
    setGeminiBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      const pageUrl = sourceUrl.trim() || undefined;
      const enriched = await api.accommodation.enrichFromGeminiHtml.mutate({
        html,
        pageUrl,
      });
      applyGeminiEnrichmentPayload(enriched);
    } catch (geminiHtmlError) {
      setError(
        geminiHtmlError instanceof Error
          ? geminiHtmlError.message
          : "Не удалось заполнить карточку из HTML через Gemini",
      );
    } finally {
      setGeminiBusy(false);
    }
  }, [applyGeminiEnrichmentPayload, geminiHtmlDraft, setError, sourceUrl]);

  const onGeocodeSearch = useCallback(async () => {
    const query = locationLabel.trim();
    if (!query) {
      setError("Введите адрес или район для поиска координат");
      return;
    }
    setGeocodeBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      const result = await api.accommodation.geocodeByQuery.mutate({
        query,
        limit: 5,
      });
      setGeocodeResults(result);
      if (result.length === 0) {
        setError("Ничего не найдено, уточните адрес");
      }
    } catch (geocodeError) {
      setError(
        geocodeError instanceof Error
          ? geocodeError.message
          : "Ошибка геокодирования",
      );
    } finally {
      setGeocodeBusy(false);
    }
  }, [locationLabel, setError]);

  const closeAfterSave = useCallback(() => {
    setTitle("");
    setProvider("");
    setSourceUrl("");
    setLocationLabel("");
    setSelectedCoords(null);
    setLatInput("");
    setLngInput("");
    setPrice("");
    setPricingMode("total");
    setCurrency("USD");
    setRating("");
    setFreeCancellation(false);
    setAmenitiesInput("");
    setNotes("");
    setPreviewDescription("");
    setPreviewImages([]);
    setManualImageUrlDraft("");
    setManualImageZoneDraft("");
    setGalleryHtmlDraft("");
    setGeminiHtmlDraft("");
    setGeocodeResults([]);
    setEditingId(null);
    setIsModalOpen(false);
  }, []);

  /** Как у кнопки «Добавить вариант»: очистить поля, режим цены прежний. */
  const primeEmptyDraft = useCallback(() => {
    setEditingId(null);
    setTitle("");
    setProvider("");
    setSourceUrl("");
    setLocationLabel("");
    setSelectedCoords(null);
    setLatInput("");
    setLngInput("");
    setPrice("");
    setCurrency("USD");
    setRating("");
    setFreeCancellation(false);
    setAmenitiesInput("");
    setNotes("");
    setPreviewDescription("");
    setPreviewImages([]);
    setManualImageUrlDraft("");
    setManualImageZoneDraft("");
    setGalleryHtmlDraft("");
    setGeminiHtmlDraft("");
    setGeocodeResults([]);
  }, []);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTitle("");
    setProvider("");
    setSourceUrl("");
    setLocationLabel("");
    setSelectedCoords(null);
    setLatInput("");
    setLngInput("");
    setPrice("");
    setPricingMode("total");
    setCurrency("USD");
    setRating("");
    setFreeCancellation(false);
    setAmenitiesInput("");
    setNotes("");
    setPreviewDescription("");
    setPreviewImages([]);
    setManualImageUrlDraft("");
    setManualImageZoneDraft("");
    setGeminiHtmlDraft("");
    setGalleryHtmlDraft("");
    setGeocodeResults([]);
    setError(null);
    setIsModalOpen(false);
  }, [setError]);

  const onUploadImages = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget;
      const fileList = input.files;
      if (!fileList || fileList.length === 0) return;
      const files = Array.from(fileList)
        .filter((f) => f.size > 0)
        .slice(0, 5);
      if (files.length === 0) return;

      setUploadBusy(true);
      setError(null);
      try {
        const api = getApiClient();

        const urls: string[] = [];
        for (const file of files) {
          const contentType = file.type || "image/jpeg";

          const signed = await api.s3.getSignedImageUploadUrl.mutate({
            tripId,
            filename: file.name,
            contentType,
            size: file.size,
          });

          const res = await fetch(signed.uploadUrl, {
            method: "PUT",
            headers: {
              "Content-Type": contentType,
            },
            body: file,
          });

          if (!res.ok) {
            throw new Error(
              `Ошибка загрузки в S3: ${res.status} ${res.statusText}`,
            );
          }

          urls.push(signed.publicUrl);
        }

        setPreviewImages((prev) =>
          mergePreviewImageItems(
            prev,
            urls.map((url) => ({ url })),
          ),
        );
      } catch (uploadError) {
        setError(
          uploadError instanceof Error
            ? uploadError.message
            : "Не удалось загрузить картинки",
        );
      } finally {
        setUploadBusy(false);
        input.value = "";
      }
    },
    [setError, tripId],
  );

  const addPreviewImageFromUrl = useCallback(() => {
    const raw = manualImageUrlDraft.trim();
    if (!raw) {
      setError("Вставьте ссылку на изображение");
      return;
    }
    let normalized: string;
    try {
      const u = new URL(raw);
      if (u.protocol !== "http:" && u.protocol !== "https:") {
        setError("Нужна ссылка с http:// или https://");
        return;
      }
      normalized = u.href;
    } catch {
      setError("Некорректная ссылка");
      return;
    }
    if (normalized.length > 2048) {
      setError("Ссылка слишком длинная (макс. 2048 символов)");
      return;
    }
    if (previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX) {
      setError(
        `Уже добавлено максимум ${ACCOMMODATION_PREVIEW_IMAGES_MAX} изображений`,
      );
      return;
    }
    if (previewImages.some((p) => p.url === normalized)) {
      setError("Эта ссылка уже в списке");
      return;
    }
    setError(null);
    const zoneTrim = manualImageZoneDraft.trim();
    const row: AccommodationPreviewImage = {
      url: normalized,
      ...(zoneTrim ? { zone: zoneTrim } : {}),
    };
    setPreviewImages((prev) => mergePreviewImageItems(prev, [row]));
    setManualImageUrlDraft("");
    setManualImageZoneDraft("");
  }, [manualImageUrlDraft, manualImageZoneDraft, previewImages, setError]);

  const onCreate = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!canCollaborate) {
        setError("Редактирование доступно только участникам поездки.");
        return;
      }
      try {
        const api = getApiClient();
        const amenitiesParsed = parseAmenitiesFromInput(amenitiesInput);
        const ratingNum = rating.trim() ? Number(rating) : undefined;
        if (rating.trim() !== "" && !Number.isFinite(ratingNum)) {
          setError("Некорректное значение рейтинга");
          return;
        }
        if (editingId) {
          await api.accommodation.update.mutate({
            optionId: editingId,
            title,
            provider: provider || undefined,
            sourceUrl: sourceUrl || undefined,
            locationLabel: locationLabel || undefined,
            coordinates: selectedCoords ?? undefined,
            price: price ? Number(price) : undefined,
            pricingMode,
            currency: currency.trim().toUpperCase() || undefined,
            rating:
              ratingNum !== undefined && Number.isFinite(ratingNum)
                ? ratingNum
                : undefined,
            freeCancellation,
            amenities: amenitiesParsed.length ? amenitiesParsed : undefined,
            notes: notes.trim() || undefined,
            previewDescription: previewDescription || undefined,
            previewImages: previewImages.length
              ? sanitizePreviewImagesForSave(previewImages)
              : undefined,
          });
        } else {
          await api.accommodation.create.mutate({
            tripId,
            title,
            provider: provider || undefined,
            sourceUrl: sourceUrl || undefined,
            locationLabel: locationLabel || undefined,
            coordinates: selectedCoords ?? undefined,
            price: price ? Number(price) : undefined,
            pricingMode,
            currency: currency.trim().toUpperCase() || undefined,
            rating:
              ratingNum !== undefined && Number.isFinite(ratingNum)
                ? ratingNum
                : undefined,
            freeCancellation,
            amenities: amenitiesParsed.length ? amenitiesParsed : undefined,
            notes: notes.trim() || undefined,
            previewDescription: previewDescription || undefined,
            previewImages: previewImages.length
              ? sanitizePreviewImagesForSave(previewImages)
              : undefined,
          });
        }
        closeAfterSave();
        await loadOptions();
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Не удалось добавить жилье",
        );
      }
    },
    [
      amenitiesInput,
      canCollaborate,
      closeAfterSave,
      currency,
      editingId,
      freeCancellation,
      loadOptions,
      locationLabel,
      notes,
      previewDescription,
      previewImages,
      price,
      pricingMode,
      provider,
      rating,
      selectedCoords,
      setError,
      sourceUrl,
      title,
      tripId,
    ],
  );

  const openNewVariant = useCallback(() => {
    primeEmptyDraft();
    setError(null);
    setIsModalOpen(true);
  }, [primeEmptyDraft, setError]);

  const startEditingItem = useCallback(
    (item: Option) => {
      if (!canCollaborate) return;
      setEditingId(item.id);
      setTitle(item.title);
      setProvider(item.provider);
      setSourceUrl(item.sourceUrl);
      setLocationLabel(item.locationLabel);
      setSelectedCoords(item.coordinates);
      setLatInput(item.coordinates ? String(item.coordinates.lat) : "");
      setLngInput(item.coordinates ? String(item.coordinates.lng) : "");
      setPrice(item.price !== null ? String(item.price) : "");
      setPricingMode(item.pricingMode);
      setCurrency(normalizeModalCurrency(item.currency));
      setRating(item.rating !== null ? String(item.rating) : "");
      setFreeCancellation(item.freeCancellation);
      setAmenitiesInput(item.amenities.join(", "));
      setNotes(item.notes);
      setPreviewDescription(item.previewDescription);
      setPreviewImages(item.previewImages);
      setManualImageUrlDraft("");
      setManualImageZoneDraft("");
      setGalleryHtmlDraft("");
      setGeminiHtmlDraft("");
      setGeocodeResults([]);
      setIsModalOpen(true);
    },
    [canCollaborate],
  );

  const modalProps = useMemo<Omit<AccommodationFormModalProps, "open">>(
    () => ({
      editingId,
      resetForm,
      onCreate,
      title,
      setTitle,
      provider,
      setProvider,
      pricingMode,
      setPricingMode,
      sourceUrl,
      setSourceUrl,
      previewBusy,
      geminiBusy,
      onFetchPreview,
      onGeminiEnrich,
      geminiHtmlDraft,
      setGeminiHtmlDraft,
      onGeminiEnrichFromHtml,
      locationLabel,
      setLocationLabel,
      setGeocodeResults,
      geocodeBusy,
      onGeocodeSearch,
      geocodeResults,
      setSelectedCoords,
      latInput,
      setLatInput,
      lngInput,
      setLngInput,
      selectedCoords,
      mapCenter,
      previewDescription,
      setPreviewDescription,
      previewImages,
      setPreviewImages,
      uploadBusy,
      galleryGeminiBusy,
      onUploadImages,
      manualImageUrlDraft,
      setManualImageUrlDraft,
      manualImageZoneDraft,
      setManualImageZoneDraft,
      addPreviewImageFromUrl,
      galleryHtmlDraft,
      setGalleryHtmlDraft,
      onGalleryGeminiFromHtml,
      price,
      setPrice,
      currency,
      setCurrency,
      formUsdToRubTotal,
      peopleCount,
      rating,
      setRating,
      freeCancellation,
      setFreeCancellation,
      amenitiesInput,
      setAmenitiesInput,
      notes,
      setNotes,
      formatRubAmount,
    }),
    [
      addPreviewImageFromUrl,
      amenitiesInput,
      currency,
      editingId,
      formUsdToRubTotal,
      freeCancellation,
      galleryGeminiBusy,
      galleryHtmlDraft,
      geocodeBusy,
      geocodeResults,
      geminiBusy,
      geminiHtmlDraft,
      latInput,
      lngInput,
      locationLabel,
      manualImageUrlDraft,
      manualImageZoneDraft,
      mapCenter,
      notes,
      onCreate,
      onFetchPreview,
      onGalleryGeminiFromHtml,
      onGeocodeSearch,
      onGeminiEnrich,
      onGeminiEnrichFromHtml,
      onUploadImages,
      peopleCount,
      previewBusy,
      previewDescription,
      previewImages,
      price,
      pricingMode,
      provider,
      rating,
      resetForm,
      selectedCoords,
      sourceUrl,
      title,
      uploadBusy,
    ],
  );

  return {
    mapCenter,
    modalProps,
    isModalOpen,
    editingId,
    openNewVariant,
    startEditing: startEditingItem,
    resetForm,
  };
}
