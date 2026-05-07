"use client";

import { AccommodationStatusBadge } from "@/components/accommodation-status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  ACCOMMODATION_PREVIEW_IMAGES_MAX,
  MIN_PASTED_LISTING_HTML_CHARS,
} from "@/lib/accommodation-constants";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import type { AccommodationPreviewImage } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Dialog } from "@base-ui/react/dialog";
import {
  Calculator,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  MoreHorizontal,
  Pencil,
  Trash2,
  User,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

type Option = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["accommodation"]["list"]["query"]>
>[number];
type GeocodeResult = Awaited<
  ReturnType<
    ReturnType<typeof getApiClient>["accommodation"]["geocodeByQuery"]["mutate"]
  >
>[number];

type GeminiEnrichmentPayload = Awaited<
  ReturnType<
    ReturnType<
      typeof getApiClient
    >["accommodation"]["enrichFromGeminiUrl"]["mutate"]
  >
>;

/** Секции миниатюр в модалке галереи: порядок зон как при первом появлении в списке. */
function groupPreviewImagesByZone(
  images: AccommodationPreviewImage[],
): { label: string; indices: number[] }[] {
  const order: string[] = [];
  const byZone = new Map<string, number[]>();
  images.forEach((img, idx) => {
    const raw = img.zone?.trim();
    const key = raw && raw.length > 0 ? raw : "__none__";
    if (!byZone.has(key)) {
      byZone.set(key, []);
      order.push(key);
    }
    byZone.get(key)!.push(idx);
  });
  return order.map((k) => ({
    label: k === "__none__" ? "Без подписи" : k,
    indices: byZone.get(k)!,
  }));
}

function mergePreviewImageItems(
  existing: AccommodationPreviewImage[],
  incoming: AccommodationPreviewImage[],
): AccommodationPreviewImage[] {
  const seen = new Set(existing.map((x) => x.url));
  const out: AccommodationPreviewImage[] = [...existing];
  for (const item of incoming) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    const z = item.zone?.trim();
    out.push({
      url: item.url,
      ...(z ? { zone: z } : {}),
    });
    if (out.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX) break;
  }
  return out;
}

function sanitizePreviewImagesForSave(
  items: AccommodationPreviewImage[],
): AccommodationPreviewImage[] {
  return items.map(({ url, zone }) => ({
    url,
    ...(zone?.trim() ? { zone: zone.trim() } : {}),
  }));
}

type AccommodationCommentRow = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  createdAt: string;
  canDelete: boolean;
};

const AccommodationMap = dynamic(
  () =>
    import("@/components/accommodation-map").then(
      (mod) => mod.AccommodationMap,
    ),
  { ssr: false },
);

function formatAmount(value: number, currency: string) {
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

function formatRubAmount(value: number): string {
  return `${value.toLocaleString("ru-RU", {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ₽`;
}

function isUsdCurrency(code: string): boolean {
  return code.trim().toUpperCase() === "USD";
}

function closeNearestDetailsMenu(trigger: HTMLElement) {
  trigger.closest("details")?.removeAttribute("open");
}

/** Ряд карта / голосование / источник: одинаковая высота и ширина ячейки на десктопе */
const lodgingQuickToolbarBtnClass =
  "flex h-9 min-h-[2.25rem] flex-1 items-center justify-center md:size-9 md:min-h-9 md:flex-none [&_svg]:pointer-events-none";

/**
 * Ночи по UTC-календарным датам из ISO (как при сохранении настроек поездки).
 * Если даты сохранены в обратном порядке (конец раньше начала), считаем интервал
 * между ранней и поздней датой — чтобы «за человека» и per-night не падали в 1 ночь.
 */
function tripNightsFromIsoRange(
  startIso: string | null,
  endIso: string | null,
): number {
  const s = startIso?.slice(0, 10);
  const e = endIso?.slice(0, 10);
  if (!s || !e) return 1;
  const parseYmd = (ymd: string) => {
    const parts = ymd.split("-").map((x) => Number.parseInt(x, 10));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
      return NaN;
    }
    const [y, m, d] = parts;
    return Date.UTC(y, m - 1, d);
  };
  let t0 = parseYmd(s);
  let t1 = parseYmd(e);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return 1;
  if (t1 < t0) {
    const tmp = t0;
    t0 = t1;
    t1 = tmp;
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((t1 - t0) / dayMs);
  if (!Number.isFinite(diffDays) || diffDays < 1) return 1;
  return diffDays;
}

type ModalCurrency = "USD" | "EUR" | "RUB";

function normalizeModalCurrency(raw: string | undefined): ModalCurrency {
  const code = (raw ?? "").trim().toUpperCase();
  if (code === "RUB" || code === "EUR" || code === "USD") return code;
  return "USD";
}

export default function AccommodationsPage() {
  const { id } = useParams<{ id: string }>();
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [peopleCount, setPeopleCount] = useState(4);
  const [tripStartDate, setTripStartDate] = useState<string | null>(null);
  const [tripEndDate, setTripEndDate] = useState<string | null>(null);
  const [tripRequirements, setTripRequirements] = useState<string[]>([]);
  const [galleryImages, setGalleryImages] = useState<
    AccommodationPreviewImage[]
  >([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [galleryGeminiBusy, setGalleryGeminiBusy] = useState(false);
  const [galleryHtmlDraft, setGalleryHtmlDraft] = useState("");
  const [rubPerUsd, setRubPerUsd] = useState<number | null>(null);
  const [cbrUsdRubQuoteDate, setCbrUsdRubQuoteDate] = useState<string | null>(
    null,
  );
  const [commentsByOption, setCommentsByOption] = useState<
    Record<string, AccommodationCommentRow[]>
  >({});
  const [commentModalOptionId, setCommentModalOptionId] = useState<
    string | null
  >(null);
  const [voteModalOptionId, setVoteModalOptionId] = useState<string | null>(
    null,
  );
  const [detailOptionId, setDetailOptionId] = useState<string | null>(null);
  const [detailGalleryIndex, setDetailGalleryIndex] = useState(0);
  const [commentModalDraft, setCommentModalDraft] = useState("");
  const [commentModalBusy, setCommentModalBusy] = useState(false);
  /** Участник поездки и с токеном — может менять жильё и комментировать */
  const [canCollaborate, setCanCollaborate] = useState(false);
  const cardRefs = useRef<Map<string, HTMLElement>>(new Map());
  const mapSectionRef = useRef<HTMLElement | null>(null);
  const mapFocusNonceRef = useRef(0);
  const galleryPointerStartXRef = useRef<number | null>(null);
  const galleryPointerStartYRef = useRef<number | null>(null);
  const [mapFocusRequest, setMapFocusRequest] = useState<{
    id: string;
    nonce: number;
  } | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(
    null,
  );
  /** Чтобы текст не зависел от localStorage до гидратации и не ломал SSR */
  const [viewerHintReady, setViewerHintReady] = useState(false);

  useEffect(() => {
    setViewerHintReady(true);
  }, []);

  const clearMapFocusRequest = useCallback(() => {
    setMapFocusRequest(null);
  }, []);

  const revealAccommodationOnMap = useCallback((item: Option) => {
    if (!item.coordinates) {
      setError("У этого варианта нет координат для карты.");
      return;
    }
    setError(null);
    mapFocusNonceRef.current += 1;
    setMapFocusRequest({ id: item.id, nonce: mapFocusNonceRef.current });
    requestAnimationFrame(() => {
      mapSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, []);

  function openGallery(images: AccommodationPreviewImage[], startIndex = 0) {
    if (images.length === 0) return;
    setGalleryImages(images);
    const safeIndex = Math.min(Math.max(startIndex, 0), images.length - 1);
    setGalleryIndex(safeIndex);
  }

  function closeGallery() {
    setGalleryImages([]);
    setGalleryIndex(0);
  }

  function showPrevGalleryImage() {
    setGalleryIndex((idx) => Math.max(0, idx - 1));
  }

  function showNextGalleryImage() {
    setGalleryIndex((idx) => Math.min(galleryImages.length - 1, idx + 1));
  }

  const gallerySections = useMemo(
    () => groupPreviewImagesByZone(galleryImages),
    [galleryImages],
  );

  useEffect(() => {
    if (galleryImages.length === 0) return;
    const len = galleryImages.length;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setGalleryImages([]);
        setGalleryIndex(0);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setGalleryIndex((idx) => Math.max(0, idx - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setGalleryIndex((idx) => Math.min(len - 1, idx + 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryImages]);

  function openVoteModal(optionId: string) {
    setVoteModalOptionId(optionId);
  }

  function closeVoteModal() {
    setVoteModalOptionId(null);
  }

  const loadAccommodationsPageContext = useCallback(async () => {
    try {
      const api = getApiClient();
      const ctx = await api.trip.forAccommodationsPage.query({ tripId: id });
      setCanCollaborate(ctx.canCollaborate);
      setPeopleCount(ctx.peopleCount);
      setTripStartDate(ctx.startDate);
      setTripEndDate(ctx.endDate);
      setTripRequirements(ctx.housingRequirements);
    } catch {
      setCanCollaborate(false);
    }
  }, [id]);

  const loadCbrUsdRubRate = useCallback(async () => {
    try {
      const api = getApiClient();
      const r = await api.forex.usdRubRate.query();
      if (r.ok) {
        setRubPerUsd(r.rubPerUsd);
        setCbrUsdRubQuoteDate(r.quoteDate);
      } else {
        setRubPerUsd(null);
        setCbrUsdRubQuoteDate(null);
      }
    } catch {
      setRubPerUsd(null);
      setCbrUsdRubQuoteDate(null);
    }
  }, []);

  const reloadAccommodationComments = useCallback(async () => {
    try {
      const api = getApiClient();
      const data = await api.accommodation.commentsForTrip.query({
        tripId: id,
      });
      setCommentsByOption(data);
    } catch {
      setCommentsByOption({});
    }
  }, [id]);

  const loadOptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const result = await api.accommodation.list.query({
        tripId: id,
      });
      setOptions(result);
      await reloadAccommodationComments();
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось загрузить жилье",
      );
    } finally {
      setIsLoading(false);
    }
  }, [id, reloadAccommodationComments]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccommodationsPageContext();
      void loadOptions();
      void loadCbrUsdRubRate();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAccommodationsPageContext, loadOptions, loadCbrUsdRubRate]);

  useEffect(() => {
    function onPageShow(ev: PageTransitionEvent) {
      if (ev.persisted) void loadAccommodationsPageContext();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadAccommodationsPageContext();
      }
    }
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadAccommodationsPageContext]);

  useEffect(() => {
    if (!highlightedCardId) return;
    const t = window.setTimeout(() => setHighlightedCardId(null), 3200);
    return () => window.clearTimeout(t);
  }, [highlightedCardId]);

  useEffect(() => {
    if (!error) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setError(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [error]);

  const scrollToAccommodationCard = useCallback((optionId: string) => {
    const el = cardRefs.current.get(optionId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    requestAnimationFrame(() => {
      setHighlightedCardId(optionId);
    });
  }, []);

  function parseAmenitiesFromInput(raw: string): string[] {
    return raw
      .split(/[,;]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  function applyGeminiEnrichmentPayload(enriched: GeminiEnrichmentPayload) {
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
  }

  async function onFetchPreview() {
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
  }

  async function onGeminiEnrich() {
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
  }

  async function onGalleryGeminiFromHtml() {
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
  }

  async function onGeminiEnrichFromHtml() {
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
  }

  async function onGeocodeSearch() {
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
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
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
          tripId: id,
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
      setGeocodeResults([]);
      setEditingId(null);
      setIsFormModalOpen(false);
      await loadOptions();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось добавить жилье",
      );
    }
  }

  function startEditing(item: Option) {
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
    setGeocodeResults([]);
    setIsFormModalOpen(true);
  }

  function resetForm() {
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
    setIsFormModalOpen(false);
  }

  async function onDelete(optionId: string) {
    const confirmed = window.confirm("Удалить карточку жилья?");
    if (!confirmed) return;
    try {
      const api = getApiClient();
      await api.accommodation.delete.mutate({ optionId });
      if (editingId === optionId) {
        resetForm();
      }
      setSelectedIds((prev) => prev.filter((idItem) => idItem !== optionId));
      await loadOptions();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Не удалось удалить карточку",
      );
    }
  }

  function openCommentModal(optionId: string) {
    if (!canCollaborate) return;
    setCommentModalOptionId(optionId);
    setCommentModalDraft("");
    setError(null);
  }

  function closeCommentModal() {
    setCommentModalOptionId(null);
    setCommentModalDraft("");
  }

  async function submitCommentFromModal() {
    if (!canCollaborate) return;
    const optionId = commentModalOptionId;
    if (!optionId) return;
    const body = commentModalDraft.trim();
    if (!body) {
      setError("Введите текст комментария");
      return;
    }
    setCommentModalBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      await api.accommodation.addAccommodationComment.mutate({
        optionId,
        body,
      });
      await reloadAccommodationComments();
      closeCommentModal();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Не удалось отправить комментарий",
      );
    } finally {
      setCommentModalBusy(false);
    }
  }

  async function handleDeleteAccommodationComment(commentId: string) {
    const confirmed = window.confirm("Удалить этот комментарий?");
    if (!confirmed) return;
    setError(null);
    try {
      const api = getApiClient();
      await api.accommodation.deleteAccommodationComment.mutate({ commentId });
      await reloadAccommodationComments();
    } catch (delError) {
      setError(
        delError instanceof Error
          ? delError.message
          : "Не удалось удалить комментарий",
      );
    }
  }

  async function onUploadImages(event: ChangeEvent<HTMLInputElement>) {
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
          tripId: id,
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
      // Allow re-uploading the same file set
      input.value = "";
    }
  }

  function addPreviewImageFromUrl() {
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
  }

  async function onVote(optionId: string, value: "up" | "down") {
    const api = getApiClient();
    await api.accommodation.vote.mutate({ optionId, value });
    await loadOptions();
  }

  async function onStatus(
    optionId: string,
    status: "shortlisted" | "rejected" | "booked",
  ) {
    const api = getApiClient();
    await api.accommodation.updateStatus.mutate({ optionId, status });
    await loadOptions();
  }

  async function toggleBooked(item: Option) {
    const nextStatus = item.status === "booked" ? "shortlisted" : "booked";
    await onStatus(item.id, nextStatus);
  }

  async function toggleNoLongerAvailable(item: Option) {
    const api = getApiClient();
    await api.accommodation.setNoLongerAvailable.mutate({
      optionId: item.id,
      noLongerAvailable: !item.noLongerAvailable,
    });
    await loadOptions();
  }

  const compareOptions = useMemo(
    () => options.filter((item) => selectedIds.includes(item.id)),
    [options, selectedIds],
  );

  function toggleCompare(optionId: string) {
    setSelectedIds((prev) =>
      prev.includes(optionId)
        ? prev.filter((idItem) => idItem !== optionId)
        : prev.length >= 5
          ? prev
          : [...prev, optionId],
    );
  }

  const nights = useMemo(
    () => tripNightsFromIsoRange(tripStartDate, tripEndDate),
    [tripStartDate, tripEndDate],
  );

  function calcTotalPrice(item: Option): number | null {
    if (item.price === null) return null;
    if (item.pricingMode === "perNight") return item.price * nights;
    if (item.pricingMode === "perPerson") return item.price * peopleCount;
    return item.price;
  }

  function calcPerPerson(item: Option): number | null {
    const total = calcTotalPrice(item);
    if (total === null) return null;
    return total / Math.max(1, peopleCount);
  }

  function getPricingModeLabel(mode: Option["pricingMode"]): string {
    if (mode === "perNight") return "за ночь";
    if (mode === "perPerson") return "за человека";
    return "за период";
  }

  function getPricingModeHint(mode: Option["pricingMode"]): string {
    if (mode === "perNight") return "Цена рассчитывается за ночь";
    if (mode === "perPerson") return "Цена рассчитывается за человека";
    return "Цена рассчитывается за весь период";
  }

  function getLatestComment(
    comments: AccommodationCommentRow[],
  ): AccommodationCommentRow | null {
    if (comments.length === 0) return null;
    return comments.reduce((latest, current) =>
      new Date(current.createdAt).getTime() >
      new Date(latest.createdAt).getTime()
        ? current
        : latest,
    );
  }

  function formatCommentTimestamp(dateIso: string): string {
    return new Date(dateIso).toLocaleString("ru-RU", {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

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

  const detailOption = useMemo(
    () => options.find((o) => o.id === detailOptionId) ?? null,
    [options, detailOptionId],
  );

  function openAccommodationDetail(item: Option) {
    setDetailGalleryIndex(0);
    setDetailOptionId(item.id);
  }

  function closeAccommodationDetail() {
    setDetailOptionId(null);
  }

  /** Сумма в USD как «общая», по тем же правилам что и в карточке (для оценки ₽). */
  const formUsdComparableTotal = useMemo(() => {
    const n = Number(price);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (pricingMode === "perNight") return n * nights;
    if (pricingMode === "perPerson") return n * Math.max(1, peopleCount);
    return n;
  }, [price, pricingMode, nights, peopleCount]);

  const formUsdToRubTotal =
    rubPerUsd !== null &&
    isUsdCurrency(currency.trim()) &&
    formUsdComparableTotal !== null
      ? formUsdComparableTotal * rubPerUsd
      : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Сравнение жилья</h1>
          <p className="text-sm text-muted-foreground">
            Число человек в поездке для расчёта «за человека»:{" "}
            <strong>{peopleCount}</strong>.
            {canCollaborate ? (
              <>
                {" "}
                Изменить можно в блоке «Настройки поездки» на странице поездки.
              </>
            ) : null}{" "}
            Ночей: <strong>{nights}</strong>.
          </p>
          {!canCollaborate ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {!viewerHintReady ? (
                <>
                  Просмотр по ссылке. Изменения доступны только участникам
                  поездки после входа в аккаунт.
                </>
              ) : getAuthToken() ? (
                <>
                  Вы вошли в аккаунт, но не участник этой поездки — доступен
                  только просмотр по ссылке.
                </>
              ) : (
                <>
                  Открытый по ссылке просмотр.{" "}
                  <Link className="font-medium underline" href="/auth">
                    Войдите
                  </Link>
                  , если вы участник поездки, чтобы добавлять и редактировать
                  варианты.
                </>
              )}
            </p>
          ) : null}
          {rubPerUsd !== null && cbrUsdRubQuoteDate ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Варианты в <strong>USD</strong> дополнительно показаны в рублях (
              ориентировочно по курсу ЦБ РФ от{" "}
              {new Date(cbrUsdRubQuoteDate).toLocaleString("ru-RU", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              })}
              , 1 USD ≈ {rubPerUsd.toFixed(2)} ₽).
            </p>
          ) : null}
        </div>
        <Link
          className={buttonVariants({ variant: "outline" })}
          href={`/trips/${id}`}
        >
          Назад к поездке
        </Link>
      </div>

      <section className="mb-6 rounded-2xl border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium">Управление вариантами</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {canCollaborate
                ? "Добавляйте и редактируйте карточки жилья в отдельном окне."
                : "Добавлять и редактировать могут только участники поездки (в аккаунте)."}
            </p>
          </div>
          {canCollaborate ? (
            <Button
              type="button"
              onClick={() => {
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
                setError(null);
                setIsFormModalOpen(true);
              }}
            >
              Добавить вариант
            </Button>
          ) : null}
        </div>
      </section>

      <section
        ref={mapSectionRef}
        className="mb-6 scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm"
      >
        <h2 className="text-lg font-medium">Общая карта жилья</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Показываются только карточки, где указаны координаты.
        </p>
        <div className="mt-3 h-[360px] overflow-hidden rounded-xl border">
          <AccommodationMap
            center={mapCenter}
            rubPerUsd={rubPerUsd}
            focusRequest={mapFocusRequest}
            onFocusRequestHandled={clearMapFocusRequest}
            onJumpToList={scrollToAccommodationCard}
            points={options.map((item) => ({
              id: item.id,
              title: item.title,
              coordinates: item.coordinates,
              locationLabel: item.locationLabel,
              status: item.status,
              noLongerAvailable: item.noLongerAvailable,
              price: item.price,
              currency: item.currency,
              image: item.previewImages[0]?.url,
              sourceUrl: item.sourceUrl,
            }))}
          />
        </div>
      </section>

      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] left-1/2 z-[2600] w-[min(92vw,34rem)] max-w-[calc(100vw-1rem)] -translate-x-1/2 px-2"
        >
          <div className="flex items-start gap-2 rounded-xl border border-destructive/45 bg-card py-2 pl-4 pr-2 shadow-xl">
            <p className="min-w-0 flex-1 py-1.5 text-sm leading-snug text-destructive">
              {error}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Закрыть сообщение"
              onClick={() => setError(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <p className="mt-1 px-1 text-center text-[11px] text-muted-foreground">
            Esc — закрыть
          </p>
        </div>
      ) : null}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загружаем варианты...</p>
      ) : null}

      <section className="grid gap-3">
        {options.map((item) => (
          <article
            key={item.id}
            ref={(node) => {
              if (node) cardRefs.current.set(item.id, node);
              else cardRefs.current.delete(item.id);
            }}
            className={cn(
              "scroll-mt-24 rounded-2xl border border-border/60 bg-card p-4 shadow-sm transition-[box-shadow,opacity] duration-500 dark:border-border/80 sm:p-5",
              item.noLongerAvailable && "opacity-[0.55]",
              highlightedCardId === item.id &&
                "ring-2 ring-primary ring-offset-2 ring-offset-background",
            )}
          >
            <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-start">
              <div>
                {item.previewImages[0] ? (
                  <button
                    type="button"
                    className="w-full text-left"
                    title={item.previewImages[0].zone ?? undefined}
                    onClick={() => openGallery(item.previewImages, 0)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL превью без white-list в next/image */}
                    <img
                      src={item.previewImages[0].url}
                      alt=""
                      className="h-44 w-full rounded-lg object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                    />
                  </button>
                ) : (
                  <div className="flex h-44 w-full items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">
                    Нет изображения
                  </div>
                )}
                {item.previewImages.length > 1 ? (
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {item.previewImages.slice(1, 9).map((image, index) => (
                      <button
                        key={`${item.id}-thumb-${image.url}-${index}`}
                        type="button"
                        title={image.zone ?? undefined}
                        className="relative overflow-hidden rounded-md border"
                        onClick={() =>
                          openGallery(item.previewImages, index + 1)
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL превью без white-list в next/image */}
                        <img
                          src={image.url}
                          alt=""
                          className="h-14 w-full object-cover md:h-16"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                        {image.zone ? (
                          <span className="absolute bottom-0 left-0 right-0 truncate bg-black/55 px-0.5 text-[9px] leading-tight text-white">
                            {image.zone}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <div className="grid gap-2.5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start md:gap-3">
                  <div className="min-w-0">
                    <h3 className="min-w-0 text-lg font-semibold leading-snug text-foreground">
                      <button
                        type="button"
                        className="block w-full max-w-full cursor-pointer rounded  text-left font-semibold text-inherit text-pretty decoration-primary underline-offset-4 outline-none transition-colors line-clamp-2 hover:bg-muted/60 hover:text-primary hover:underline focus-visible:bg-muted/60 focus-visible:text-primary focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring"
                        title="Подробный вид варианта"
                        aria-label={`Открыть подробный вид: ${item.title}`}
                        onClick={() => openAccommodationDetail(item)}
                      >
                        {item.title}
                      </button>
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {item.noLongerAvailable ? (
                        <span
                          className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground"
                          title="Помечено как недоступное для бронирования"
                        >
                          Занято / недоступно
                        </span>
                      ) : null}
                      {item.locationLabel ? (
                        <span className="text-xs text-muted-foreground">
                          {item.locationLabel}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs md:justify-end">
                    <button
                      type="button"
                      className="rounded-full bg-muted/25 px-2.5 py-1 text-foreground/90 transition hover:bg-muted/45 dark:bg-white/10 dark:hover:bg-white/15"
                      onClick={() => openVoteModal(item.id)}
                      title="Посмотреть, кто как проголосовал"
                    >
                      <span className="font-medium">
                        {item.rating !== null ? (
                          <>
                            ★{" "}
                            <span className="tabular-nums">{item.rating}</span>{" "}
                            ·{" "}
                          </>
                        ) : null}
                        Голоса{" "}
                        <span className="tabular-nums">
                          {item.upVotes - item.downVotes}
                        </span>
                      </span>
                    </button>
                    <AccommodationStatusBadge status={item.status} />
                  </div>
                </div>

                {item.amenities.length ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {item.amenities.slice(0, 5).map((amenity) => (
                      <span
                        key={amenity}
                        className="rounded-full bg-muted/35 px-2 py-0.5 text-xs text-muted-foreground/85 dark:bg-white/10 dark:text-foreground/65"
                      >
                        {amenity}
                      </span>
                    ))}
                    {item.amenities.length > 5 ? (
                      <span className="rounded-full bg-muted/35 px-2 py-0.5 text-xs text-muted-foreground/85 dark:bg-white/10 dark:text-foreground/65">
                        +{item.amenities.length - 5}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {tripRequirements.length ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Совпадение с требованиями:{" "}
                    {
                      tripRequirements.filter((req) =>
                        item.amenities
                          .map((amenity) => amenity.toLowerCase())
                          .includes(req.toLowerCase()),
                      ).length
                    }
                    /{tripRequirements.length}
                  </p>
                ) : null}

                <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,1fr)_17rem] md:items-start">
                  {item.previewDescription ? (
                    <p className="line-clamp-3 text-sm text-muted-foreground md:line-clamp-4">
                      {item.previewDescription}
                    </p>
                  ) : (
                    <div className="hidden md:block" aria-hidden />
                  )}

                  <aside className="space-y-2 text-xs text-muted-foreground md:border-l md:border-border/50 md:pl-4 dark:md:border-border/80">
                    {item.price !== null ? (
                      <>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/90">
                              За весь период
                            </p>
                            <p className="mt-0.5 text-base font-semibold tabular-nums text-foreground sm:text-lg">
                              {formatAmount(
                                calcTotalPrice(item) ?? 0,
                                item.currency,
                              )}
                            </p>
                          </div>
                          {item.pricingMode !== "total" ? (
                            <span
                              className="inline-flex items-center gap-1 pt-0.5 text-[11px] text-muted-foreground"
                              title={getPricingModeHint(item.pricingMode)}
                            >
                              <Calculator className="size-3.5" aria-hidden />
                              {getPricingModeLabel(item.pricingMode)}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span>
                            На человека ({peopleCount}):{" "}
                            <span className="font-medium text-foreground/90">
                              {calcPerPerson(item) !== null
                                ? formatAmount(
                                    calcPerPerson(item) ?? 0,
                                    item.currency,
                                  )
                                : "—"}
                            </span>
                          </span>
                        </div>
                        {rubPerUsd !== null &&
                        isUsdCurrency(item.currency) &&
                        calcTotalPrice(item) !== null &&
                        calcPerPerson(item) !== null ? (
                          <div>
                            <div>
                              ≈{" "}
                              {formatRubAmount(
                                (calcTotalPrice(item) ?? 0) * rubPerUsd,
                              )}{" "}
                              общая
                            </div>
                            <div className="mt-0.5">
                              ≈{" "}
                              {formatRubAmount(
                                (calcPerPerson(item) ?? 0) * rubPerUsd,
                              )}{" "}
                              на человека
                            </div>
                          </div>
                        ) : null}
                        {item.freeCancellation ? (
                          <span className="inline-flex text-emerald-700 dark:text-emerald-300">
                            Бесплатная отмена
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <div>Цена не указана — добавьте вручную.</div>
                    )}
                  </aside>
                </div>

                <div className="mt-5 rounded-lg border border-border/50 bg-muted/10 p-2.5 dark:border-border/75 sm:p-3">
                  <div
                    className={cn(
                      "flex gap-2",
                      "flex-col max-md:[&>*]:w-full max-md:[&>*]:justify-center",
                      "md:flex-row md:flex-wrap md:items-center",
                    )}
                  >
                    {!canCollaborate ? (
                      <Button
                        size="sm"
                        variant={
                          selectedIds.includes(item.id) ? "default" : "outline"
                        }
                        className="shrink-0 gap-1 md:w-auto"
                        onClick={() => toggleCompare(item.id)}
                      >
                        {selectedIds.includes(item.id)
                          ? "В сравнении"
                          : "Сравнить"}
                      </Button>
                    ) : null}

                    {canCollaborate ? (
                      <div className="flex w-full min-w-0 shrink-0 gap-2 md:w-auto">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!item.coordinates}
                          title={
                            item.coordinates
                              ? "Показать на общей карте жилья"
                              : "Сначала задайте координаты варианта при редактировании"
                          }
                          aria-label={
                            item.coordinates ? "На карте" : "Нет координат"
                          }
                          className={cn(lodgingQuickToolbarBtnClass, "px-0")}
                          onClick={() => revealAccommodationOnMap(item)}
                        >
                          <MapPin className="size-4" aria-hidden />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            lodgingQuickToolbarBtnClass,
                            "px-0 text-base leading-none md:px-0",
                            item.userVote === "up" &&
                              "border-emerald-500/60 bg-emerald-500/15 text-emerald-900 ring-1 ring-emerald-500/30 hover:bg-emerald-500/20 dark:text-emerald-300",
                          )}
                          aria-label="Лайкнуть вариант"
                          onClick={() => void onVote(item.id, "up")}
                        >
                          👍
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className={cn(
                            lodgingQuickToolbarBtnClass,
                            "px-0 text-base leading-none md:px-0",
                            item.userVote === "down" &&
                              "border-red-500/60 bg-red-500/15 text-red-900 ring-1 ring-red-500/30 hover:bg-red-500/20 dark:text-red-300",
                          )}
                          aria-label="Дизлайкнуть вариант"
                          onClick={() => void onVote(item.id, "down")}
                        >
                          👎
                        </Button>
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Открыть источник"
                            aria-label="Открыть источник во внешней вкладке"
                            className={cn(
                              buttonVariants({
                                variant: "outline",
                                size: "sm",
                              }),
                              lodgingQuickToolbarBtnClass,
                              "inline-flex shrink-0 no-underline",
                              "border-dashed px-0",
                            )}
                          >
                            <ExternalLink
                              className="size-4 opacity-80"
                              aria-hidden
                            />
                          </a>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex w-full shrink-0 gap-2 md:w-auto">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!item.coordinates}
                          title={
                            item.coordinates
                              ? "Показать на общей карте жилья"
                              : "Нет координат на карте"
                          }
                          aria-label={
                            item.coordinates ? "На карте" : "Нет координат"
                          }
                          className={cn(lodgingQuickToolbarBtnClass, "px-0")}
                          onClick={() => revealAccommodationOnMap(item)}
                        >
                          <MapPin className="size-4" aria-hidden />
                        </Button>
                        {item.sourceUrl ? (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            title="Открыть источник"
                            aria-label="Открыть источник во внешней вкладке"
                            className={cn(
                              buttonVariants({
                                variant: "outline",
                                size: "sm",
                              }),
                              lodgingQuickToolbarBtnClass,
                              "inline-flex shrink-0 no-underline",
                              "border-dashed px-0",
                            )}
                          >
                            <ExternalLink
                              className="size-4 opacity-80"
                              aria-hidden
                            />
                          </a>
                        ) : null}
                      </div>
                    )}

                    {canCollaborate ? (
                      <details
                        className={cn(
                          "group relative shrink-0 max-md:w-full",
                          "md:ml-auto",
                        )}
                      >
                        <summary
                          className={cn(
                            buttonVariants({
                              variant: "outline",
                              size: "sm",
                            }),
                            "flex h-9 min-h-[2.25rem] cursor-pointer list-none items-center justify-center gap-2 md:h-9 [&::-webkit-details-marker]:hidden max-md:w-full md:min-h-9",
                          )}
                          aria-label="Дополнительные действия с вариантом"
                        >
                          <MoreHorizontal
                            className="size-4 text-muted-foreground"
                            aria-hidden
                          />
                          <span>Ещё</span>
                        </summary>
                        <div
                          role="menu"
                          className="absolute top-[calc(100%+0.375rem)] right-0 z-30 min-w-[12.5rem] rounded-lg border border-border bg-popover py-1 text-popover-foreground shadow-lg max-md:inset-x-0 max-md:right-0 max-md:left-0"
                        >
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-auto w-full justify-start rounded-none px-3 py-2 font-normal",
                              item.status === "booked" &&
                                "bg-muted/70 font-medium",
                            )}
                            onClick={(e) => {
                              void toggleBooked(item);
                              closeNearestDetailsMenu(e.currentTarget);
                            }}
                          >
                            {item.status === "booked"
                              ? "Снять бронь"
                              : "Забронировать"}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn(
                              "h-auto w-full justify-start rounded-none px-3 py-2 font-normal",
                              selectedIds.includes(item.id) &&
                                "bg-primary/12 font-medium text-primary",
                            )}
                            onClick={(e) => {
                              toggleCompare(item.id);
                              closeNearestDetailsMenu(e.currentTarget);
                            }}
                          >
                            {selectedIds.includes(item.id)
                              ? "В сравнении"
                              : "Сравнить"}
                          </Button>
                          <div className="my-1 h-px bg-border" aria-hidden />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 font-normal"
                            title={
                              item.noLongerAvailable
                                ? "Показывать снова как доступный для брони"
                                : "Приглушить карточку для команды — объект занят другими"
                            }
                            onClick={(e) => {
                              void toggleNoLongerAvailable(item);
                              closeNearestDetailsMenu(e.currentTarget);
                            }}
                          >
                            {item.noLongerAvailable
                              ? "Снова доступно"
                              : "Занято у других"}
                          </Button>
                          <div className="my-1 h-px bg-border" aria-hidden />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 font-normal"
                            onClick={(e) => {
                              closeNearestDetailsMenu(e.currentTarget);
                              startEditing(item);
                            }}
                          >
                            <Pencil
                              className="size-4 text-muted-foreground"
                              aria-hidden
                            />
                            Редактировать
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto w-full justify-start gap-2 rounded-none px-3 py-2 font-normal text-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={(e) => {
                              closeNearestDetailsMenu(e.currentTarget);
                              void onDelete(item.id);
                            }}
                          >
                            <Trash2 className="size-4" aria-hidden />
                            Удалить
                          </Button>
                        </div>
                      </details>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 rounded-lg border border-border/60 bg-muted/5 px-3 py-2.5 dark:border-border/80">
                  <div className="flex items-start justify-between gap-2 max-md:flex-col">
                    <div className="min-w-0 flex-1 max-md:w-full">
                      <p className="text-sm font-medium">
                        Комментарии участников{" "}
                        <span className="text-xs tabular-nums text-muted-foreground">
                          ({commentsByOption[item.id]?.length ?? 0})
                        </span>
                      </p>
                      {(() => {
                        const latestComment = getLatestComment(
                          commentsByOption[item.id] ?? [],
                        );
                        return latestComment?.body.trim() ? (
                          <p className="line-clamp-1 wrap-anywhere text-xs text-muted-foreground">
                            {latestComment.authorName}: {latestComment.body} ·{" "}
                            {formatCommentTimestamp(latestComment.createdAt)}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {canCollaborate
                              ? "Обсуждение открывается в подробном виде карточки."
                              : "Пока нет комментариев."}
                          </p>
                        );
                      })()}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-start max-md:w-full max-md:[&>*]:flex-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="max-md:min-h-9"
                        onClick={() => openAccommodationDetail(item)}
                      >
                        Обсуждение
                      </Button>
                      {canCollaborate ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="max-md:min-h-9"
                          onClick={() => openCommentModal(item.id)}
                        >
                          Добавить
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        ))}
      </section>

      <Dialog.Root
        open={detailOptionId !== null}
        onOpenChange={(open) => {
          if (!open) closeAccommodationDetail();
        }}
      >
        <Dialog.Portal>
          <div className="fixed inset-0 z-[2140] flex items-center justify-center overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Dialog.Backdrop className="absolute inset-0 z-0 bg-black/60 backdrop-blur-[1px] transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
            <Dialog.Popup className="relative z-10 my-6 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-[min(100vw-2rem,56rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl outline-none">
              {detailOption ? (
                <>
                  <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
                    <div className="min-w-0">
                      <Dialog.Title className="text-xl font-semibold tracking-tight text-pretty">
                        {detailOption.title}
                      </Dialog.Title>
                      <Dialog.Description className="sr-only">
                        Подробный вид варианта жилья: фото, карта и данные для
                        сравнения.
                      </Dialog.Description>
                      {detailOption.provider ? (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {detailOption.provider}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <AccommodationStatusBadge
                          status={detailOption.status}
                        />
                        {detailOption.noLongerAvailable ? (
                          <span className="rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
                            Занято / недоступно
                          </span>
                        ) : null}
                        {detailOption.locationLabel ? (
                          <span className="flex items-start gap-1 text-xs text-muted-foreground">
                            <MapPin
                              className="mt-0.5 size-3.5 shrink-0"
                              aria-hidden
                            />
                            <span>{detailOption.locationLabel}</span>
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <Dialog.Close
                      className="rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      aria-label="Закрыть"
                    >
                      <X className="size-5" aria-hidden />
                    </Dialog.Close>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-5 sm:px-5">
                    <div className="mt-4 grid gap-6 lg:grid-cols-5">
                      <div className="min-w-0 space-y-3 lg:col-span-3">
                        {detailOption.previewImages.length > 0 ? (
                          <>
                            <button
                              type="button"
                              className="group relative aspect-[4/3] w-full overflow-hidden rounded-2xl border bg-muted shadow-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                              title="Открыть галерею"
                              onClick={() =>
                                openGallery(
                                  detailOption.previewImages,
                                  detailGalleryIndex,
                                )
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  detailOption.previewImages[detailGalleryIndex]
                                    ?.url ?? detailOption.previewImages[0]!.url
                                }
                                alt=""
                                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                referrerPolicy="no-referrer"
                              />
                              <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
                                Открыть галерею
                              </span>
                            </button>
                            {detailOption.previewImages.length > 1 ? (
                              <div
                                role="tablist"
                                aria-label="Миниатюры фото"
                                className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
                              >
                                {detailOption.previewImages.map((img, idx) => (
                                  <button
                                    key={`${detailOption.id}-dthumb-${idx}`}
                                    role="tab"
                                    type="button"
                                    aria-selected={detailGalleryIndex === idx}
                                    onClick={() => setDetailGalleryIndex(idx)}
                                    title={img.zone?.trim() || undefined}
                                    className={cn(
                                      "relative h-14 w-[3.85rem] shrink-0 overflow-hidden rounded-lg border-2 outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring",
                                      detailGalleryIndex === idx
                                        ? "border-primary"
                                        : "border-transparent opacity-80 hover:opacity-100",
                                    )}
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={img.url}
                                      alt=""
                                      className="size-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </>
                        ) : (
                          <div className="flex aspect-[4/3] w-full items-center justify-center rounded-2xl border border-dashed text-sm text-muted-foreground">
                            Нет фотографий
                          </div>
                        )}
                        {detailOption.previewDescription ? (
                          <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Описание
                            </p>
                            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                              {detailOption.previewDescription}
                            </p>
                          </div>
                        ) : null}
                        {detailOption.amenities.length > 0 ? (
                          <div>
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Удобства
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {detailOption.amenities.map((amenity) => (
                                <span
                                  key={`${detailOption.id}-am-${amenity}`}
                                  className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground"
                                >
                                  {amenity}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {tripRequirements.length ? (
                          <p className="text-xs text-muted-foreground">
                            Совпадение с требованиями поездки:{" "}
                            {
                              tripRequirements.filter((req) =>
                                detailOption.amenities
                                  .map((a) => a.toLowerCase())
                                  .includes(req.toLowerCase()),
                              ).length
                            }
                            /{tripRequirements.length}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-4 lg:col-span-2">
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Расположение
                          </p>
                          <div className="mt-2 h-[220px] overflow-hidden rounded-xl border sm:h-[260px]">
                            {detailOption.coordinates ? (
                              <AccommodationMap
                                center={detailOption.coordinates}
                                rubPerUsd={rubPerUsd}
                                points={[
                                  {
                                    id: detailOption.id,
                                    title: detailOption.title,
                                    coordinates: detailOption.coordinates,
                                    locationLabel: detailOption.locationLabel,
                                    status: detailOption.status,
                                    noLongerAvailable:
                                      detailOption.noLongerAvailable,
                                    price: detailOption.price,
                                    currency: detailOption.currency,
                                    image: detailOption.previewImages[0]?.url,
                                    sourceUrl: detailOption.sourceUrl,
                                  },
                                ]}
                              />
                            ) : (
                              <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted/40 px-3 text-center text-sm text-muted-foreground">
                                <MapPin
                                  className="size-8 opacity-55"
                                  aria-hidden
                                />
                                У варианта нет координат.
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border bg-muted/30 p-4">
                          {detailOption.price !== null ? (
                            <>
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <p className="text-sm font-medium">
                                  Общая цена:{" "}
                                  {formatAmount(
                                    calcTotalPrice(detailOption) ?? 0,
                                    detailOption.currency,
                                  )}
                                </p>
                                <span className="text-xs text-muted-foreground">
                                  Тип:{" "}
                                  {getPricingModeLabel(
                                    detailOption.pricingMode,
                                  )}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                На человека ({peopleCount}):{" "}
                                {calcPerPerson(detailOption) !== null
                                  ? formatAmount(
                                      calcPerPerson(detailOption) ?? 0,
                                      detailOption.currency,
                                    )
                                  : "—"}
                              </p>
                              {rubPerUsd !== null &&
                              isUsdCurrency(detailOption.currency) &&
                              calcTotalPrice(detailOption) !== null &&
                              calcPerPerson(detailOption) !== null ? (
                                <div className="mt-2 border-t border-border/60 pt-2 text-xs text-muted-foreground">
                                  <p>
                                    ≈{" "}
                                    {formatRubAmount(
                                      (calcTotalPrice(detailOption) ?? 0) *
                                        rubPerUsd,
                                    )}{" "}
                                    общая
                                  </p>
                                  <p className="mt-0.5">
                                    ≈{" "}
                                    {formatRubAmount(
                                      (calcPerPerson(detailOption) ?? 0) *
                                        rubPerUsd,
                                    )}{" "}
                                    на человека
                                  </p>
                                </div>
                              ) : null}
                            </>
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Цена не указана.
                            </p>
                          )}
                          {detailOption.rating !== null ? (
                            <p className="mt-2 text-sm text-muted-foreground">
                              Рейтинг:{" "}
                              <span className="font-medium text-foreground">
                                {detailOption.rating}
                              </span>
                            </p>
                          ) : null}
                          {detailOption.freeCancellation ? (
                            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                              Бесплатная отмена
                            </p>
                          ) : null}
                        </div>

                        {detailOption.notes ? (
                          <div className="rounded-xl border border-dashed border-border/80 p-3">
                            <p className="text-xs font-medium text-muted-foreground">
                              Заметки
                            </p>
                            <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
                              {detailOption.notes}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-6 rounded-xl border bg-muted/15 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex min-w-0 items-baseline gap-2">
                          <p className="text-sm font-medium">
                            Комментарии участников
                          </p>
                          {(commentsByOption[detailOption.id]?.length ?? 0) >
                          0 ? (
                            <span className="text-xs tabular-nums text-muted-foreground">
                              {commentsByOption[detailOption.id]!.length}
                            </span>
                          ) : null}
                        </div>
                        {canCollaborate ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="shrink-0"
                            onClick={() => openCommentModal(detailOption.id)}
                          >
                            Добавить комментарий
                          </Button>
                        ) : null}
                      </div>
                      {(commentsByOption[detailOption.id] ?? []).length ===
                      0 ? (
                        <p className="mt-2 text-xs text-muted-foreground">
                          Пока нет комментариев.
                        </p>
                      ) : (
                        <ul className="mt-2 max-h-56 space-y-3 overflow-y-auto pr-1">
                          {(commentsByOption[detailOption.id] ?? []).map(
                            (c) => (
                              <li
                                key={c.id}
                                className="flex gap-2 rounded-lg border border-border/60 bg-card px-2 py-2 text-sm"
                              >
                                <div className="relative size-9 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                                  {c.authorAvatarUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={c.authorAvatarUrl}
                                      alt=""
                                      className="absolute inset-0 size-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  ) : (
                                    <div className="flex size-full items-center justify-center text-muted-foreground">
                                      <User className="size-4" aria-hidden />
                                    </div>
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                                    <span className="font-medium">
                                      {c.authorName}
                                    </span>
                                    <time
                                      className="shrink-0 text-[11px] text-muted-foreground"
                                      dateTime={c.createdAt}
                                    >
                                      {new Date(c.createdAt).toLocaleString(
                                        "ru-RU",
                                        {
                                          dateStyle: "short",
                                          timeStyle: "short",
                                        },
                                      )}
                                    </time>
                                  </div>
                                  <p className="mt-1 whitespace-pre-wrap wrap-break-words text-muted-foreground">
                                    {c.body}
                                  </p>
                                </div>
                                {c.canDelete ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 shrink-0 self-start text-muted-foreground hover:text-destructive"
                                    title="Удалить комментарий"
                                    aria-label="Удалить комментарий"
                                    onClick={() =>
                                      void handleDeleteAccommodationComment(
                                        c.id,
                                      )
                                    }
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                ) : null}
                              </li>
                            ),
                          )}
                        </ul>
                      )}
                    </div>

                    <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        disabled={!detailOption.coordinates}
                        onClick={() => {
                          closeAccommodationDetail();
                          revealAccommodationOnMap(detailOption);
                        }}
                      >
                        <MapPin className="size-3.5" aria-hidden />
                        На общей карте
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          toggleCompare(detailOption.id);
                        }}
                      >
                        {selectedIds.includes(detailOption.id)
                          ? "Убрать из сравнения"
                          : "В сравнение"}
                      </Button>
                      {detailOption.sourceUrl ? (
                        <a
                          href={detailOption.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            buttonVariants({ variant: "outline", size: "sm" }),
                            "inline-flex gap-1.5 no-underline",
                          )}
                        >
                          <ExternalLink
                            className="size-3.5 shrink-0 opacity-80"
                            aria-hidden
                          />
                          Открыть источник
                        </a>
                      ) : null}
                      {canCollaborate ? (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant={
                              detailOption.noLongerAvailable
                                ? "secondary"
                                : "outline"
                            }
                            title="Отметить, что объект занят другими"
                            onClick={() =>
                              void toggleNoLongerAvailable(detailOption)
                            }
                          >
                            {detailOption.noLongerAvailable
                              ? "Снова доступно"
                              : "Занято у других"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => openVoteModal(detailOption.id)}
                          >
                            Голоса:{" "}
                            <span className="tabular-nums font-medium">
                              {detailOption.upVotes - detailOption.downVotes}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(
                              detailOption.userVote === "up" &&
                                "border-emerald-500/80 bg-emerald-500/25 text-emerald-900 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 dark:text-emerald-300",
                            )}
                            aria-label="Лайкнуть вариант"
                            onClick={() => void onVote(detailOption.id, "up")}
                          >
                            👍
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className={cn(
                              detailOption.userVote === "down" &&
                                "border-red-500/80 bg-red-500/25 text-red-900 ring-1 ring-red-500/40 hover:bg-red-500/30 dark:text-red-300",
                            )}
                            aria-label="Дизлайкнуть вариант"
                            onClick={() => void onVote(detailOption.id, "down")}
                          >
                            👎
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            onClick={() => {
                              closeAccommodationDetail();
                              startEditing(detailOption);
                            }}
                          >
                            Редактировать
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : null}
            </Dialog.Popup>
          </div>
        </Dialog.Portal>
      </Dialog.Root>

      {compareOptions.length >= 2 ? (
        <section className="mt-8 overflow-x-auto rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-medium">
            Таблица сравнения ({compareOptions.length})
          </h2>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pr-4">Параметр</th>
                {compareOptions.map((item) => (
                  <th key={item.id} className="pr-4">
                    {item.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pr-4 py-2">Общая цена</td>
                {compareOptions.map((item) => (
                  <td key={item.id} className="pr-4 align-top">
                    {item.price !== null ? (
                      <>
                        <span>
                          {formatAmount(
                            calcTotalPrice(item) ?? 0,
                            item.currency,
                          )}
                        </span>
                        {rubPerUsd !== null && isUsdCurrency(item.currency) ? (
                          <span className="mt-1 block whitespace-nowrap text-muted-foreground">
                            ≈{" "}
                            {formatRubAmount(
                              (calcTotalPrice(item) ?? 0) * rubPerUsd,
                            )}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="pr-4 py-2">На человека ({peopleCount})</td>
                {compareOptions.map((item) => (
                  <td key={item.id} className="pr-4 align-top">
                    {item.price !== null ? (
                      <>
                        <span>
                          {formatAmount(
                            calcPerPerson(item) ?? 0,
                            item.currency,
                          )}
                        </span>
                        {rubPerUsd !== null && isUsdCurrency(item.currency) ? (
                          <span className="mt-1 block whitespace-nowrap text-muted-foreground">
                            ≈{" "}
                            {formatRubAmount(
                              (calcPerPerson(item) ?? 0) * rubPerUsd,
                            )}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="pr-4 py-2">Тип цены</td>
                {compareOptions.map((item) => (
                  <td key={item.id} className="pr-4">
                    {getPricingModeLabel(item.pricingMode)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="pr-4 py-2 align-middle">Статус</td>
                {compareOptions.map((item) => (
                  <td key={item.id} className="pr-4 align-middle">
                    <AccommodationStatusBadge status={item.status} />
                  </td>
                ))}
              </tr>
              <tr>
                <td className="pr-4 py-2">Рейтинг</td>
                {compareOptions.map((item) => (
                  <td key={item.id} className="pr-4">
                    {item.rating ?? "—"}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="pr-4 py-2">Бесплатная отмена</td>
                {compareOptions.map((item) => (
                  <td key={item.id} className="pr-4">
                    {item.freeCancellation ? "Да" : "Нет"}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="pr-4 py-2">Голоса (баланс)</td>
                {compareOptions.map((item) => (
                  <td key={item.id} className="pr-4">
                    {item.upVotes - item.downVotes}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </section>
      ) : null}

      {galleryImages.length > 0 ? (
        <div className="fixed inset-0 z-[2200] flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/80 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="my-4 flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-full max-w-5xl flex-col rounded-xl bg-background p-3 shadow-2xl">
            <div className="mb-2 flex shrink-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm tabular-nums text-muted-foreground">
                  {galleryIndex + 1} / {galleryImages.length}
                </p>
                {galleryImages[galleryIndex]?.zone?.trim() ? (
                  <p className="mt-0.5 truncate text-sm font-medium leading-snug">
                    {galleryImages[galleryIndex]?.zone}
                  </p>
                ) : null}
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Стрелки на клавиатуре · свайп на мобильном
                </p>
              </div>
              <Button size="icon" variant="outline" onClick={closeGallery}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative min-h-0 shrink-0">
              <div
                className="touch-pan-y flex max-h-[min(70vh,520px)] justify-center overflow-hidden rounded-lg border bg-black"
                onPointerDown={(e) => {
                  if (e.pointerType !== "touch") return;
                  galleryPointerStartXRef.current = e.clientX;
                  galleryPointerStartYRef.current = e.clientY;
                }}
                onPointerUp={(e) => {
                  if (e.pointerType !== "touch") return;
                  const startX = galleryPointerStartXRef.current;
                  const startY = galleryPointerStartYRef.current;
                  galleryPointerStartXRef.current = null;
                  galleryPointerStartYRef.current = null;
                  if (startX === null || startY === null) return;
                  const dx = e.clientX - startX;
                  const dy = e.clientY - startY;
                  if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx)) return;
                  if (dx < 0) {
                    showNextGalleryImage();
                  } else {
                    showPrevGalleryImage();
                  }
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL превью без white-list в next/image */}
                <img
                  src={galleryImages[galleryIndex]?.url}
                  alt=""
                  className="max-h-[min(70vh,520px)] w-auto object-contain"
                  referrerPolicy="no-referrer"
                />
              </div>
              <Button
                size="icon"
                variant="outline"
                className="absolute top-1/2 left-2 z-10 -translate-y-1/2"
                disabled={galleryIndex <= 0}
                onClick={showPrevGalleryImage}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="absolute top-1/2 right-2 z-10 -translate-y-1/2"
                disabled={galleryIndex >= galleryImages.length - 1}
                onClick={showNextGalleryImage}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden pr-1 pb-1">
              {gallerySections.map((section) => (
                <div key={section.label}>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {section.label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {section.indices.map((idx) => (
                      <button
                        key={`gallery-thumb-${idx}`}
                        type="button"
                        className={cn(
                          "h-12 w-[4.05rem] shrink-0 overflow-hidden rounded-md border-2 bg-black/40 transition-opacity",
                          idx === galleryIndex
                            ? "border-primary opacity-100"
                            : "border-transparent opacity-80 hover:opacity-100",
                        )}
                        onClick={() => setGalleryIndex(idx)}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={galleryImages[idx]?.url}
                          alt=""
                          className="size-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {voteModalOptionId !== null ? (
        <div className="fixed inset-0 z-[2260] flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/50 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          {(() => {
            const selected = options.find((o) => o.id === voteModalOptionId);
            const upVoters =
              selected?.votes.filter((v) => v.value === "up") ?? [];
            const downVoters =
              selected?.votes.filter((v) => v.value === "down") ?? [];
            return (
              <div className="my-6 flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-medium">Голоса по варианту</h2>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {selected?.title ?? "Вариант жилья"}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={closeVoteModal}
                  >
                    Закрыть
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-emerald-600/30 bg-emerald-600/5 p-3">
                    <div className="text-sm font-medium text-emerald-700 dark:text-emerald-500">
                      За ({upVoters.length})
                    </div>
                    {upVoters.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Пока нет голосов.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm">
                        {upVoters.map((v) => (
                          <li key={`${v.userId}-up`} className="truncate">
                            {v.userName}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <div className="text-sm font-medium text-destructive">
                      Против ({downVoters.length})
                    </div>
                    {downVoters.length === 0 ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Пока нет голосов.
                      </p>
                    ) : (
                      <ul className="mt-2 space-y-1 text-sm">
                        {downVoters.map((v) => (
                          <li key={`${v.userId}-down`} className="truncate">
                            {v.userName}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : null}

      {commentModalOptionId !== null && canCollaborate ? (
        <div className="fixed inset-0 z-[2260] flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/50 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="my-6 flex max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-full max-w-lg flex-col overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-medium">Новый комментарий</h2>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {options.find((o) => o.id === commentModalOptionId)?.title ??
                    "Вариант жилья"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={commentModalBusy}
                onClick={closeCommentModal}
              >
                Закрыть
              </Button>
            </div>
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                void submitCommentFromModal();
              }}
            >
              <textarea
                className="min-h-[120px] w-full resize-y rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="Текст виден всем участникам поездки…"
                maxLength={2000}
                value={commentModalDraft}
                onChange={(e) => setCommentModalDraft(e.target.value)}
                disabled={commentModalBusy}
                autoFocus
              />
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={commentModalBusy}
                  onClick={closeCommentModal}
                >
                  Отмена
                </Button>
                <Button type="submit" disabled={commentModalBusy}>
                  {commentModalBusy ? "Отправка…" : "Отправить"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isFormModalOpen && canCollaborate ? (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/50 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="my-6 max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-medium">
                {editingId ? "Редактировать вариант" : "Добавить вариант"}
              </h2>
              <Button type="button" variant="outline" onClick={resetForm}>
                Закрыть
              </Button>
            </div>

            <form
              onSubmit={onCreate}
              className="mt-4 grid gap-3 md:grid-cols-2"
            >
              <input
                className="rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="Название жилья"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
              <input
                className="rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="Провайдер (Booking/Airbnb...)"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              />
              <select
                className="rounded-lg border bg-background px-3 py-2 text-sm"
                value={pricingMode}
                onChange={(e) =>
                  setPricingMode(
                    e.target.value as "total" | "perNight" | "perPerson",
                  )
                }
              >
                <option value="total">Цена за весь период</option>
                <option value="perNight">Цена за ночь</option>
                <option value="perPerson">Цена за человека</option>
              </select>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <input
                  className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                  placeholder="Ссылка на объявление"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={previewBusy || geminiBusy}
                  onClick={() => void onFetchPreview()}
                >
                  {previewBusy ? "Загрузка..." : "Заполнить по ссылке"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={geminiBusy || previewBusy}
                  onClick={() => void onGeminiEnrich()}
                  title="Использует Gemini: разбор метаданных страницы и структурирование полей (нужен GEMINI_API_KEY на сервере)"
                >
                  {geminiBusy ? "Gemini…" : "Через Gemini"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground md:col-span-2">
                «Заполнить по ссылке» — только превью с страницы. «Через Gemini»
                — то же превью плюс ИИ заполняет цену, удобства, рейтинг и др.
              </p>
              <div className="md:col-span-2 space-y-2 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/15 p-3">
                <p className="text-xs text-muted-foreground">
                  Если сайт не отдаёт страницу серверу (редирект на вход):
                  вставьте HTML из DevTools. В поле «Ссылка» лучше указать URL
                  той же вкладки — так разрешатся относительные картинки; иначе
                  берётся технический базовый хост trip.com.
                </p>
                <textarea
                  className="min-h-[140px] w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
                  placeholder="Вставьте фрагмент или outerHTML узла…"
                  value={geminiHtmlDraft}
                  onChange={(e) => setGeminiHtmlDraft(e.target.value)}
                  disabled={geminiBusy}
                  spellCheck={false}
                  autoComplete="off"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={previewBusy || geminiBusy}
                  onClick={() => void onGeminiEnrichFromHtml()}
                >
                  {geminiBusy ? "Gemini…" : "Заполнить из HTML (Gemini)"}
                </Button>
              </div>
              <input
                className="rounded-lg border bg-background px-3 py-2 text-sm md:col-span-2"
                placeholder="Локация (например: центр, рядом с метро)"
                value={locationLabel}
                onChange={(e) => {
                  setLocationLabel(e.target.value);
                  setGeocodeResults([]);
                }}
              />
              <div className="flex gap-2 md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={geocodeBusy}
                  onClick={() => void onGeocodeSearch()}
                >
                  {geocodeBusy ? "Ищем координаты..." : "Найти координаты"}
                </Button>
              </div>
              {geocodeResults.length > 0 ? (
                <div className="md:col-span-2 space-y-2 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    Выберите подходящий вариант:
                  </p>
                  <div className="space-y-2">
                    {geocodeResults.map((result, index) => (
                      <button
                        key={`${result.lat}-${result.lng}-${index}`}
                        type="button"
                        className="w-full rounded-lg border bg-background px-3 py-2 text-left text-xs hover:bg-muted"
                        onClick={() => {
                          setSelectedCoords({
                            lat: result.lat,
                            lng: result.lng,
                          });
                          setLatInput(result.lat.toFixed(6));
                          setLngInput(result.lng.toFixed(6));
                          setLocationLabel(result.label);
                        }}
                      >
                        <span className="block">{result.label}</span>
                        <span className="text-muted-foreground">
                          {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="md:col-span-2">
                <p className="mb-2 text-sm font-medium">Точка на карте</p>
                <div className="h-[260px] overflow-hidden rounded-xl border">
                  <AccommodationMap
                    center={
                      selectedCoords
                        ? { lat: selectedCoords.lat, lng: selectedCoords.lng }
                        : mapCenter
                    }
                    points={[]}
                    selected={selectedCoords}
                    onSelect={(lat, lng) => {
                      setSelectedCoords({ lat, lng });
                      setLatInput(lat.toFixed(6));
                      setLngInput(lng.toFixed(6));
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Координаты:{" "}
                  {selectedCoords
                    ? `${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`
                    : "не выбраны"}
                </p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <input
                    className="rounded-lg border bg-background px-3 py-2 text-sm"
                    placeholder="Широта (lat), например 55.751244"
                    value={latInput}
                    onChange={(e) => {
                      const next = e.target.value;
                      setLatInput(next);
                      const lat = Number(next);
                      const lng = Number(lngInput);
                      if (
                        Number.isFinite(lat) &&
                        Number.isFinite(lng) &&
                        lat >= -90 &&
                        lat <= 90 &&
                        lng >= -180 &&
                        lng <= 180
                      ) {
                        setSelectedCoords({ lat, lng });
                      }
                    }}
                  />
                  <input
                    className="rounded-lg border bg-background px-3 py-2 text-sm"
                    placeholder="Долгота (lng), например 37.618423"
                    value={lngInput}
                    onChange={(e) => {
                      const next = e.target.value;
                      setLngInput(next);
                      const lat = Number(latInput);
                      const lng = Number(next);
                      if (
                        Number.isFinite(lat) &&
                        Number.isFinite(lng) &&
                        lat >= -90 &&
                        lat <= 90 &&
                        lng >= -180 &&
                        lng <= 180
                      ) {
                        setSelectedCoords({ lat, lng });
                      }
                    }}
                  />
                </div>
              </div>
              <textarea
                className="rounded-lg border bg-background px-3 py-2 text-sm md:col-span-2"
                placeholder="Описание с страницы (можно править перед сохранением)"
                rows={4}
                value={previewDescription}
                onChange={(e) => setPreviewDescription(e.target.value)}
              />
              <div className="md:col-span-2">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <label className="block text-sm font-medium">
                    Фото (опционально), до{" "}
                    <span className="tabular-nums">
                      {ACCOMMODATION_PREVIEW_IMAGES_MAX}
                    </span>
                    . У каждого кадра можно указать зону — в галерее они
                    группируются как на сайтах бронирования.
                  </label>
                  {previewImages.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10"
                      disabled={uploadBusy || galleryGeminiBusy}
                      onClick={() => {
                        setPreviewImages([]);
                        setManualImageUrlDraft("");
                        setManualImageZoneDraft("");
                      }}
                    >
                      Удалить все фото
                    </Button>
                  ) : null}
                </div>
                {previewImages.length > 0 ? (
                  <ul className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {previewImages.map((row, index) => (
                      <li
                        key={`${index}-${row.url}`}
                        className="rounded-lg border bg-muted/40 p-2"
                      >
                        <div className="relative aspect-4/3 overflow-hidden rounded-md border bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element -- превью с внешних URL */}
                          <img
                            src={row.url}
                            alt=""
                            className="size-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute right-1.5 top-1.5 size-8 border border-border/80 bg-background/90 shadow-sm hover:bg-background"
                            aria-label={`Удалить фото ${index + 1}`}
                            onClick={() =>
                              setPreviewImages((prev) =>
                                prev.filter((_, i) => i !== index),
                              )
                            }
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                        <label className="mt-2 block text-[11px] text-muted-foreground">
                          Зона (спальня, ванная, вид…)
                        </label>
                        <input
                          className="mt-1 w-full rounded-md border bg-background px-2 py-1.5 text-sm"
                          placeholder="Например: Спальня 1"
                          value={row.zone ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPreviewImages((prev) =>
                              prev.map((p, i) =>
                                i === index
                                  ? { ...p, zone: v || undefined }
                                  : p,
                              ),
                            );
                          }}
                          maxLength={80}
                        />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Загрузите файлы, вставьте прямую ссылку на картинку или
                    добавьте фрагмент HTML галереи (Gemini подставит зоны).
                  </p>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={
                    uploadBusy ||
                    galleryGeminiBusy ||
                    previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX
                  }
                  onChange={onUploadImages}
                  className="w-full cursor-pointer rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_minmax(0,12rem)]">
                  <input
                    type="url"
                    inputMode="url"
                    className="min-w-0 rounded-lg border bg-background px-3 py-2 text-sm"
                    placeholder="https://… (прямая ссылка на изображение)"
                    value={manualImageUrlDraft}
                    onChange={(e) => setManualImageUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addPreviewImageFromUrl();
                      }
                    }}
                    disabled={
                      previewImages.length >=
                        ACCOMMODATION_PREVIEW_IMAGES_MAX || galleryGeminiBusy
                    }
                  />
                  <input
                    className="min-w-0 rounded-lg border bg-background px-3 py-2 text-sm"
                    placeholder="Зона для этого URL (опц.)"
                    value={manualImageZoneDraft}
                    onChange={(e) => setManualImageZoneDraft(e.target.value)}
                    maxLength={80}
                    disabled={
                      previewImages.length >=
                        ACCOMMODATION_PREVIEW_IMAGES_MAX || galleryGeminiBusy
                    }
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={
                      previewImages.length >=
                        ACCOMMODATION_PREVIEW_IMAGES_MAX || galleryGeminiBusy
                    }
                    onClick={() => addPreviewImageFromUrl()}
                  >
                    Добавить по ссылке
                  </Button>
                </div>
                <div className="mt-4 space-y-2 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/15 p-3">
                  <p className="text-xs text-muted-foreground">
                    HTML галереи из DevTools: на странице откройте фото,
                    скопируйте узел или фрагмент с ссылками на изображения. В
                    поле «Ссылка на объявление» укажите URL той же вкладки — так
                    разрешатся относительные адреса.
                  </p>
                  <textarea
                    className="min-h-[100px] w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
                    placeholder="Вставьте HTML блока с фотографиями…"
                    value={galleryHtmlDraft}
                    onChange={(e) => setGalleryHtmlDraft(e.target.value)}
                    disabled={galleryGeminiBusy || geminiBusy}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      galleryGeminiBusy ||
                      geminiBusy ||
                      previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX
                    }
                    onClick={() => void onGalleryGeminiFromHtml()}
                  >
                    {galleryGeminiBusy
                      ? "Gemini…"
                      : "Добавить фото из HTML (зоны через Gemini)"}
                  </Button>
                </div>
                {previewImages.length >= ACCOMMODATION_PREVIEW_IMAGES_MAX ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Достигнут лимит {ACCOMMODATION_PREVIEW_IMAGES_MAX} фото —
                    удалите лишние, чтобы добавить новые.
                  </p>
                ) : null}
                {uploadBusy ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Загружаем в S3...
                  </p>
                ) : null}
              </div>
              <input
                className="rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="Введите цену согласно выбранному типу"
                type="number"
                min={0}
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <select
                className="rounded-lg border bg-background px-3 py-2 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as ModalCurrency)}
                aria-label="Валюта цены"
              >
                <option value="USD">USD — доллар США</option>
                <option value="EUR">EUR — евро</option>
                <option value="RUB">RUB — российский рубль</option>
              </select>
              {formUsdToRubTotal !== null ? (
                <p className="text-xs text-muted-foreground md:col-span-2">
                  Ориентировочно по курсу ЦБ: общая сумма в пересчёте ≈{" "}
                  <span className="tabular-nums text-foreground">
                    {formatRubAmount(formUsdToRubTotal)}
                  </span>
                  {peopleCount > 1 ? (
                    <>
                      {" "}
                      (≈{" "}
                      {formatRubAmount(
                        formUsdToRubTotal / Math.max(1, peopleCount),
                      )}{" "}
                      на человека)
                    </>
                  ) : null}
                </p>
              ) : null}
              <input
                className="rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="Рейтинг 0–10 (если есть на странице)"
                type="number"
                min={0}
                max={10}
                step="0.1"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              />
              <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm md:col-span-2">
                <input
                  type="checkbox"
                  checked={freeCancellation}
                  onChange={(e) => setFreeCancellation(e.target.checked)}
                />
                Бесплатная отмена
              </label>
              <input
                className="rounded-lg border bg-background px-3 py-2 text-sm md:col-span-2"
                placeholder="Удобства через запятую (Wi‑Fi, парковка, кухня…)"
                value={amenitiesInput}
                onChange={(e) => setAmenitiesInput(e.target.value)}
              />
              <textarea
                className="rounded-lg border bg-background px-3 py-2 text-sm md:col-span-2"
                placeholder="Заметки команде"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <div className="md:col-span-2 flex gap-2">
                <Button type="submit">
                  {editingId ? "Сохранить изменения" : "Добавить"}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Отменить
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
