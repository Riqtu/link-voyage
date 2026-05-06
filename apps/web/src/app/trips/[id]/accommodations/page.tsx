"use client";

import { AccommodationStatusBadge } from "@/components/accommodation-status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Pencil,
  Trash2,
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

type AccommodationCommentRow = {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
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

/** Ночи по UTC-календарным датам из ISO (как при сохранении настроек поездки). */
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
  const t0 = parseYmd(s);
  const t1 = parseYmd(e);
  if (!Number.isFinite(t0) || !Number.isFinite(t1)) return 1;
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
  const [previewImages, setPreviewImages] = useState<string[]>([]);
  const [manualImageUrlDraft, setManualImageUrlDraft] = useState("");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [geminiBusy, setGeminiBusy] = useState(false);
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
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [galleryIndex, setGalleryIndex] = useState(0);
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

  function openGallery(images: string[], startIndex = 0) {
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
      setPreviewImages(preview.images);
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
      setPreviewImages(enriched.previewImages);
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
          previewImages: previewImages.length ? previewImages : undefined,
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
          previewImages: previewImages.length ? previewImages : undefined,
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

      setPreviewImages((prev) => [...prev, ...urls].slice(0, 8));
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
    if (previewImages.length >= 8) {
      setError("Уже добавлено максимум 8 изображений");
      return;
    }
    if (previewImages.includes(normalized)) {
      setError("Эта ссылка уже в списке");
      return;
    }
    setError(null);
    setPreviewImages((prev) => [...prev, normalized].slice(0, 8));
    setManualImageUrlDraft("");
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
              image: item.previewImages[0],
              sourceUrl: item.sourceUrl,
            }))}
          />
        </div>
      </section>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
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
              "scroll-mt-24 rounded-2xl border bg-card p-5 shadow-sm transition-[box-shadow,opacity] duration-500",
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
                    onClick={() => openGallery(item.previewImages, 0)}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL превью без white-list в next/image */}
                    <img
                      src={item.previewImages[0]}
                      alt=""
                      className="max-h-44 w-full rounded-lg object-cover"
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
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {item.previewImages.slice(1, 5).map((image, index) => (
                      <button
                        key={`${item.id}-thumb-${index}`}
                        type="button"
                        className="overflow-hidden rounded-md border"
                        onClick={() =>
                          openGallery(item.previewImages, index + 1)
                        }
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- внешние URL превью без white-list в next/image */}
                        <img
                          src={image}
                          alt=""
                          className="h-14 w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-lg font-semibold">
                      {item.title}
                    </h3>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <AccommodationStatusBadge status={item.status} />
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
                      {item.coordinates ? (
                        <span className="text-xs text-muted-foreground">
                          {item.coordinates.lat.toFixed(4)},{" "}
                          {item.coordinates.lng.toFixed(4)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex w-full flex-wrap items-center gap-2 text-xs sm:w-auto sm:justify-end">
                    <button
                      type="button"
                      className="rounded-full border px-2 py-0.5 text-foreground/90 transition hover:bg-muted"
                      onClick={() => openVoteModal(item.id)}
                      title="Посмотреть, кто как проголосовал"
                    >
                      Голоса:{" "}
                      <span className="font-medium tabular-nums">
                        {item.upVotes - item.downVotes}
                      </span>
                    </button>
                    {item.rating !== null ? (
                      <span className="rounded-full border px-2 py-0.5 text-foreground/90">
                        Рейтинг:{" "}
                        <span className="font-medium tabular-nums">
                          {item.rating}
                        </span>
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 rounded-xl border bg-muted/30 p-3">
                  {item.price !== null ? (
                    <>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="text-sm font-medium">
                          Общая цена:{" "}
                          {formatAmount(
                            calcTotalPrice(item) ?? 0,
                            item.currency,
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Тип: {item.pricingMode}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        На человека ({peopleCount}):{" "}
                        {calcPerPerson(item) !== null
                          ? formatAmount(
                              calcPerPerson(item) ?? 0,
                              item.currency,
                            )
                          : "—"}
                      </div>
                      {rubPerUsd !== null &&
                      isUsdCurrency(item.currency) &&
                      calcTotalPrice(item) !== null &&
                      calcPerPerson(item) !== null ? (
                        <div className="mt-1.5 border-t border-border/60 pt-1.5 text-xs text-muted-foreground">
                          <div>
                            ≈{" "}
                            {formatRubAmount(
                              (calcTotalPrice(item) ?? 0) * rubPerUsd,
                            )}{" "}
                            общая (оценка)
                          </div>
                          <div className="mt-0.5">
                            ≈{" "}
                            {formatRubAmount(
                              (calcPerPerson(item) ?? 0) * rubPerUsd,
                            )}{" "}
                            на человека (оценка)
                          </div>
                        </div>
                      ) : null}
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">
                      Цена не указана — добавьте вручную.
                    </div>
                  )}

                  {item.freeCancellation ? (
                    <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                      Бесплатная отмена
                    </div>
                  ) : null}
                </div>

                {item.amenities.length ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.amenities.slice(0, 5).map((amenity) => (
                      <span
                        key={amenity}
                        className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground"
                      >
                        {amenity}
                      </span>
                    ))}
                    {item.amenities.length > 5 ? (
                      <span className="rounded-full border bg-background px-2 py-0.5 text-xs text-muted-foreground">
                        +{item.amenities.length - 5}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {tripRequirements.length ? (
                  <p className="mt-2 text-xs text-muted-foreground">
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

                {item.previewDescription ? (
                  <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">
                    {item.previewDescription}
                  </p>
                ) : null}

                <div className="mt-4 rounded-xl border bg-card p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-baseline gap-2">
                      <p className="text-sm font-medium">
                        Комментарии участников
                      </p>
                      {(commentsByOption[item.id]?.length ?? 0) > 0 ? (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {commentsByOption[item.id]!.length}
                        </span>
                      ) : null}
                    </div>
                    {canCollaborate ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="shrink-0"
                        onClick={() => openCommentModal(item.id)}
                      >
                        Добавить комментарий
                      </Button>
                    ) : null}
                  </div>
                  {(commentsByOption[item.id] ?? []).length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {canCollaborate
                        ? "Пока никто не написал — нажмите «Добавить комментарий»."
                        : "Пока нет комментариев."}
                    </p>
                  ) : (
                    <ul className="mt-2 max-h-48 space-y-3 overflow-y-auto pr-1">
                      {(commentsByOption[item.id] ?? []).map((c) => (
                        <li
                          key={c.id}
                          className="flex gap-2 rounded-lg border border-border/60 bg-muted/20 px-2 py-2 text-sm"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                              <span className="font-medium">
                                {c.authorName}
                              </span>
                              <time
                                className="shrink-0 text-[11px] text-muted-foreground"
                                dateTime={c.createdAt}
                              >
                                {new Date(c.createdAt).toLocaleString("ru-RU", {
                                  dateStyle: "short",
                                  timeStyle: "short",
                                })}
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
                                void handleDeleteAccommodationComment(c.id)
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="mt-4 space-y-2.5">
                  {canCollaborate ? (
                    <Button
                      size="sm"
                      className="w-full"
                      variant={
                        item.status === "booked" ? "secondary" : "default"
                      }
                      onClick={() => void toggleBooked(item)}
                    >
                      {item.status === "booked"
                        ? "Снять бронь"
                        : "Забронировать"}
                    </Button>
                  ) : null}

                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      size="sm"
                      variant={
                        selectedIds.includes(item.id) ? "default" : "outline"
                      }
                      className="w-full"
                      onClick={() => toggleCompare(item.id)}
                    >
                      {selectedIds.includes(item.id)
                        ? "В сравнении"
                        : "Сравнить"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full gap-1"
                      disabled={!item.coordinates}
                      title={
                        item.coordinates
                          ? "Показать точку на общей карте жилья"
                          : canCollaborate
                            ? "Сначала задайте координаты варианта при редактировании"
                            : "У варианта нет координат на карте"
                      }
                      onClick={() => revealAccommodationOnMap(item)}
                    >
                      <MapPin className="size-3.5 shrink-0" aria-hidden />
                      На карте
                    </Button>
                    {canCollaborate ? (
                      <>
                        <Button
                          size="sm"
                          variant={
                            item.noLongerAvailable ? "secondary" : "outline"
                          }
                          className="w-full"
                          title="Если объект уже снят другими — приглушаем карточку для команды"
                          onClick={() => void toggleNoLongerAvailable(item)}
                        >
                          {item.noLongerAvailable
                            ? "Снова доступно"
                            : "Занято у других"}
                        </Button>
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className={cn(
                              "w-full",
                              item.userVote === "up" &&
                                "border-emerald-500/80 bg-emerald-500/25 text-emerald-900 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 dark:text-emerald-300",
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
                              "w-full",
                              item.userVote === "down" &&
                                "border-red-500/80 bg-red-500/25 text-red-900 ring-1 ring-red-500/40 hover:bg-red-500/30 dark:text-red-300",
                            )}
                            aria-label="Дизлайкнуть вариант"
                            onClick={() => void onVote(item.id, "down")}
                          >
                            👎
                          </Button>
                        </div>
                      </>
                    ) : null}
                  </div>

                  {canCollaborate ? (
                    <div className="flex items-center justify-end gap-2 border-t pt-2">
                      <Button
                        size="icon"
                        variant="outline"
                        aria-label="Редактировать вариант"
                        onClick={() => startEditing(item)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="destructive"
                        aria-label="Удалить вариант"
                        onClick={() => void onDelete(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : null}
                </div>

                {item.sourceUrl ? (
                  <a
                    className="mt-2 inline-flex text-sm underline"
                    href={item.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Открыть источник
                  </a>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </section>

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
                    {item.pricingMode}
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
        <div className="fixed inset-0 z-[2200] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-background p-3 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {galleryIndex + 1} / {galleryImages.length}
              </p>
              <Button size="icon" variant="outline" onClick={closeGallery}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative">
              <div
                className="touch-pan-y flex justify-center overflow-hidden rounded-lg border bg-black"
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
                  src={galleryImages[galleryIndex]}
                  alt=""
                  className="max-h-[70vh] w-auto object-contain"
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
          </div>
        </div>
      ) : null}

      {voteModalOptionId !== null ? (
        <div className="fixed inset-0 z-[2060] flex items-center justify-center bg-black/50 p-4">
          {(() => {
            const selected = options.find((o) => o.id === voteModalOptionId);
            const upVoters =
              selected?.votes.filter((v) => v.value === "up") ?? [];
            const downVoters =
              selected?.votes.filter((v) => v.value === "down") ?? [];
            return (
              <div className="flex w-full max-w-lg flex-col rounded-2xl border bg-background p-5 shadow-2xl">
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
        <div className="fixed inset-0 z-[2050] flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-lg flex-col rounded-2xl border bg-background p-5 shadow-2xl">
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
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl">
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
                <label className="mb-2 block text-sm font-medium">
                  Картинки (опционально), до{" "}
                  <span className="tabular-nums">8</span>
                </label>
                {previewImages.length > 0 ? (
                  <ul className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {previewImages.map((imageUrl, index) => (
                      <li
                        key={`${index}-${imageUrl}`}
                        className="relative aspect-4/3 overflow-hidden rounded-lg border bg-muted"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- превью с внешних URL */}
                        <img
                          src={imageUrl}
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
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mb-2 text-xs text-muted-foreground">
                    Загрузите файлы или вставьте прямую ссылку на картинку
                    (https://…) — можно комбинировать оба способа.
                  </p>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={uploadBusy || previewImages.length >= 8}
                  onChange={onUploadImages}
                  className="w-full cursor-pointer rounded-lg border bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    type="url"
                    inputMode="url"
                    className="min-w-[12rem] flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
                    placeholder="https://… (прямая ссылка на изображение)"
                    value={manualImageUrlDraft}
                    onChange={(e) => setManualImageUrlDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addPreviewImageFromUrl();
                      }
                    }}
                    disabled={previewImages.length >= 8}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={previewImages.length >= 8}
                    onClick={() => addPreviewImageFromUrl()}
                  >
                    Добавить по ссылке
                  </Button>
                </div>
                {previewImages.length >= 8 ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Достигнут лимит 8 фото — удалите лишние, чтобы добавить
                    новые.
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
