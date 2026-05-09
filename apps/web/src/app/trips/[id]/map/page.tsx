"use client";

import { Button } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import {
  LV_MODAL_BACKDROP_ENTER_CLASS,
  LV_MODAL_PANEL_ENTER_CLASS,
  lvStaggerStyle,
} from "@/lib/lv-motion";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const TripMap = dynamic(
  () => import("@/components/trip-map").then((mod) => mod.TripMap),
  { ssr: false },
);

type TripPoint = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["tripPoint"]["list"]["query"]>
>[number];
type GeocodeResult = Awaited<
  ReturnType<
    ReturnType<typeof getApiClient>["accommodation"]["geocodeByQuery"]["mutate"]
  >
>[number];

type PlacePhotoLike = {
  getURI?(options?: { maxWidthPx?: number; maxHeightPx?: number }): string;
  getUrl?(options?: { maxWidth?: number; maxHeight?: number }): string;
  uri?: string;
  url?: string;
};

type PlaceLike = {
  displayName?: { text?: string };
  formattedAddress?: string;
  photos?: PlacePhotoLike[];
  fetchFields(request: { fields: string[] }): Promise<void>;
};

type PlaceConstructor = new (options: {
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

type PlacesLibraryLike = {
  Place?: PlaceConstructor;
};

const categoryOptions: Array<{ value: TripPoint["category"]; label: string }> =
  [
    { value: "sight", label: "Место" },
    { value: "food", label: "Еда" },
    { value: "stay", label: "Жилье" },
    { value: "transport", label: "Транспорт" },
    { value: "other", label: "Другое" },
  ];

const categoryLabelByValue: Record<TripPoint["category"], string> = {
  sight: "Достопримечательность",
  food: "Еда и кафе",
  stay: "Проживание",
  transport: "Транспорт",
  other: "Другое место",
};

export default function TripMapPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [points, setPoints] = useState<TripPoint[]>([]);
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const [focusedPointId, setFocusedPointId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pointModalOpen, setPointModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [category, setCategory] = useState<TripPoint["category"]>("sight");
  const [plannedAt, setPlannedAt] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [geocodeBusy, setGeocodeBusy] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<GeocodeResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const [pointsListOpen, setPointsListOpen] = useState(true);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(`lv-map-points-list-open-${id}`);
      if (stored === "1") setPointsListOpen(true);
      else if (stored === "0") setPointsListOpen(false);
    } catch {
      /* private mode */
    }
  }, [id]);

  const togglePointsList = useCallback(() => {
    setPointsListOpen((prev) => {
      const next = !prev;
      try {
        sessionStorage.setItem(
          `lv-map-points-list-open-${id}`,
          next ? "1" : "0",
        );
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [id]);

  const center = useMemo(() => {
    if (selectedLat !== null && selectedLng !== null) {
      return { lat: selectedLat, lng: selectedLng };
    }
    if (points.length > 0) {
      return { lat: points[0].coordinates.lat, lng: points[0].coordinates.lng };
    }
    return { lat: 55.751244, lng: 37.618423 };
  }, [points, selectedLat, selectedLng]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setImageUrl("");
    setCategory("sight");
    setPlannedAt("");
    setSelectedLat(null);
    setSelectedLng(null);
    setPlaceQuery("");
    setGeocodeResults([]);
  }, []);

  const loadPoints = useCallback(
    async (options?: { showLoading?: boolean }) => {
      const shouldShowLoading = options?.showLoading ?? false;
      if (!getAuthToken()) {
        router.replace("/auth");
        return;
      }
      if (shouldShowLoading) {
        setIsLoading(true);
      }
      setError(null);
      try {
        const api = getApiClient();
        const result = await api.tripPoint.list.query({ tripId: id });
        setPoints(result);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить точки",
        );
      } finally {
        if (shouldShowLoading) {
          setIsLoading(false);
        }
      }
    },
    [id, router],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPoints({ showLoading: true });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPoints]);

  async function savePoint() {
    if (selectedLat === null || selectedLng === null) {
      setError("Кликните по карте, чтобы выбрать координаты");
      return;
    }
    if (!title.trim()) {
      setError("Введите название точки");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const api = getApiClient();
      if (editingId) {
        await api.tripPoint.update.mutate({
          pointId: editingId,
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          coordinates: { lat: selectedLat, lng: selectedLng },
          imageUrl: imageUrl.trim() || undefined,
          plannedAt: plannedAt
            ? new Date(`${plannedAt}:00.000Z`).toISOString()
            : undefined,
        });
      } else {
        await api.tripPoint.create.mutate({
          tripId: id,
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          coordinates: { lat: selectedLat, lng: selectedLng },
          imageUrl: imageUrl.trim() || undefined,
          plannedAt: plannedAt
            ? new Date(`${plannedAt}:00.000Z`).toISOString()
            : undefined,
        });
      }
      await loadPoints();
      resetForm();
      setPointModalOpen(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить точку",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removePoint(pointId: string) {
    setError(null);
    try {
      const api = getApiClient();
      await api.tripPoint.delete.mutate({ pointId });
      await loadPoints();
      if (editingId === pointId) {
        resetForm();
      }
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Не удалось удалить точку",
      );
    }
  }

  async function onPickPointImage(file: File) {
    setUploadBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      const ct = file.type || "image/jpeg";
      const signed = await api.s3.getSignedImageUploadUrl.mutate({
        tripId: id,
        filename: file.name,
        contentType: ct,
        size: file.size,
      });
      const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": ct },
        body: file,
      });
      if (!put.ok) {
        throw new Error(`S3: ${put.status} ${put.statusText}`);
      }
      setImageUrl(signed.publicUrl);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось загрузить изображение",
      );
    } finally {
      setUploadBusy(false);
      if (imageFileRef.current) imageFileRef.current.value = "";
    }
  }

  async function searchPlace() {
    const query = placeQuery.trim();
    if (!query) {
      setError("Введите место для поиска");
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
        setError("Ничего не найдено, уточните место");
      }
    } catch (searchError) {
      setError(
        searchError instanceof Error
          ? searchError.message
          : "Ошибка геокодинга",
      );
    } finally {
      setGeocodeBusy(false);
    }
  }

  function beginEdit(point: TripPoint) {
    setEditingId(point.id);
    setPointModalOpen(true);
    setTitle(point.title);
    setDescription(point.description ?? "");
    setImageUrl(point.imageUrl ?? "");
    setCategory(point.category);
    setSelectedLat(point.coordinates.lat);
    setSelectedLng(point.coordinates.lng);
    setPlannedAt(point.plannedAt ? point.plannedAt.slice(0, 16) : "");
  }

  const fillPreviewFromPlaceId = useCallback(async (placeId?: string) => {
    if (!placeId || typeof window === "undefined" || !window.google?.maps) {
      return;
    }
    try {
      const placesLib = (await google.maps.importLibrary(
        "places",
      )) as PlacesLibraryLike;
      const Place = placesLib.Place;
      if (!Place) return;
      const getPhotoUrl = (photo?: PlacePhotoLike) =>
        photo?.getURI?.({
          maxWidthPx: 1200,
          maxHeightPx: 800,
        }) ??
        photo?.getUrl?.({
          maxWidth: 1200,
          maxHeight: 800,
        }) ??
        photo?.uri ??
        photo?.url;

      const place = new Place({ id: placeId, requestedLanguage: "ru" });
      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "photos"],
      });

      let photoUrl = getPhotoUrl(place.photos?.[0]);
      if (!photoUrl) {
        const byText = await (
          Place as unknown as {
            searchByText(request: {
              textQuery?: string;
              fields: string[];
              language?: string;
              maxResultCount?: number;
            }): Promise<{ places: PlaceLike[] }>;
          }
        ).searchByText({
          textQuery: place.displayName?.text ?? place.formattedAddress ?? "",
          fields: ["displayName", "formattedAddress", "photos"],
          language: "ru",
          maxResultCount: 1,
        });
        const candidate = byText.places?.[0];
        photoUrl = getPhotoUrl(candidate?.photos?.[0]);
        if (candidate?.displayName?.text) {
          setTitle(candidate.displayName.text);
        }
        if (candidate?.formattedAddress) {
          setDescription((prev) => prev || candidate.formattedAddress || "");
        }
      }
      if (photoUrl) {
        setImageUrl(photoUrl);
      }
      if (place.displayName?.text) {
        setTitle(place.displayName.text);
      }
      if (place.formattedAddress) {
        setDescription((prev) => prev || place.formattedAddress || "");
      }
    } catch {
      // Optional enrichment only: keep geocode flow working on any API limitation.
    }
  }, []);

  const addGooglePoiToTrip = useCallback(
    async (poi: {
      title: string;
      description?: string;
      imageUrl?: string;
      coordinates: { lat: number; lng: number };
      category: TripPoint["category"];
    }) => {
      setError(null);
      try {
        const api = getApiClient();
        const fallbackTitle =
          poi.description?.split(",")[0]?.trim() ||
          `Точка ${poi.coordinates.lat.toFixed(3)}, ${poi.coordinates.lng.toFixed(3)}`;
        await api.tripPoint.create.mutate({
          tripId: id,
          title: poi.title.trim() || fallbackTitle,
          description: poi.description?.trim() || undefined,
          category: poi.category,
          coordinates: poi.coordinates,
          imageUrl: poi.imageUrl?.trim() || undefined,
        });
        await loadPoints();
        setFocusedPointId(null);
        setSelectedLat(poi.coordinates.lat);
        setSelectedLng(poi.coordinates.lng);
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Не удалось добавить место в поездку",
        );
        throw saveError;
      }
    },
    [id, loadPoints],
  );

  return (
    <main className="relative min-h-screen">
      <section className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-0 bottom-[var(--lv-trip-tab-recess)]">
        {isLoading ? (
          <p className="p-3 text-sm text-muted-foreground">
            Загружаем карту...
          </p>
        ) : (
          <TripMap
            center={center}
            points={points}
            focusedPointId={focusedPointId}
            onAddGooglePoi={addGooglePoiToTrip}
            onPointPick={(point) => {
              setFocusedPointId(point.id);
              setSelectedLat(point.coordinates.lat);
              setSelectedLng(point.coordinates.lng);
            }}
            onSelect={(lat, lng) => {
              setFocusedPointId(null);
              setSelectedLat(lat);
              setSelectedLng(lng);
            }}
          />
        )}
      </section>

      <header className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top)+0.25rem)] z-40 px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-7xl rounded-xl border bg-card/90 px-3 py-3 shadow-lg backdrop-blur sm:px-4">
          <h1 className="text-lg font-semibold sm:text-2xl">Карта поездки</h1>
        </div>
      </header>

      {error ? (
        <div
          className={cn(
            "fixed top-[calc(8rem+env(safe-area-inset-top))] left-1/2 z-20 w-[min(92vw,42rem)] -translate-x-1/2 rounded-lg border border-destructive/40 bg-card/95 px-4 py-2 text-sm text-destructive shadow-lg backdrop-blur",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:zoom-in-95 motion-safe:duration-300 motion-safe:ease-out motion-safe:fill-mode-both",
          )}
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <aside
        className={cn(
          "fixed inset-x-2 bottom-[calc(0.5rem+var(--lv-trip-tab-recess))] z-20 overflow-hidden rounded-xl border bg-card/92 shadow-xl backdrop-blur-md",
          /* max-height (+ min-height на sm) — одинаково анимируем мобилку и десктоп. */
          "ease-[cubic-bezier(0.33,1,0.68,1)] duration-300 motion-reduce:duration-150",
          "transition-[max-height] sm:transition-[max-height,min-height]",
          "w-[calc(100%-1rem)] max-w-none sm:inset-x-auto sm:right-6 sm:bottom-[calc(1rem+var(--lv-trip-tab-recess))] sm:w-[min(24rem,92vw)]",
          !pointsListOpen && "max-h-[2.875rem] sm:min-h-[2.875rem]",
          pointsListOpen &&
            cn(
              "max-h-[min(52dvh,calc(100dvh-9rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--lv-trip-tab-recess)))]",
              "sm:max-h-[calc(100dvh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--lv-trip-tab-recess))]",
              "sm:min-h-[calc(100dvh-10.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom)-var(--lv-trip-tab-recess))]",
            ),
        )}
      >
        {/*
          flex-col-reverse: ручка внизу панели (у таб-бара), при max-h режется верх контента —
          визуально вся карточка заезжает вниз, остаётся только ручка.
        */}
        <div className="flex max-h-[inherit] flex-col-reverse sm:h-full sm:min-h-0">
          <button
            type="button"
            id="trip-points-drawer-handle"
            className="flex w-full touch-manipulation items-center justify-center gap-2 border-border/70 border-t px-4 py-2.5 text-sm font-semibold hover:bg-muted/40 active:bg-muted/55 supports-[backdrop-filter]:bg-muted/35"
            aria-expanded={pointsListOpen}
            aria-controls="trip-points-drawer-main"
            onClick={() => {
              togglePointsList();
            }}
          >
            <span className="text-foreground tabular-nums">
              Точки ({points.length})
            </span>
            <span className="text-muted-foreground">
              <span className="sr-only">
                {pointsListOpen ? "Свернуть панель" : "Развернуть панель"}
              </span>
              {pointsListOpen ? (
                <ChevronDown
                  className="size-4 transition-transform motion-reduce:transition-none"
                  aria-hidden
                />
              ) : (
                <ChevronUp
                  className="size-4 transition-transform motion-reduce:transition-none"
                  aria-hidden
                />
              )}
            </span>
          </button>

          <div
            id="trip-points-drawer-main"
            role="region"
            aria-labelledby="trip-points-heading"
            aria-hidden={!pointsListOpen}
            inert={!pointsListOpen ? true : undefined}
            className={cn(
              "flex min-h-0 max-h-[min(46dvh,22rem)] flex-1 flex-col gap-3 overflow-hidden p-4 pb-2 sm:max-h-none sm:flex-1",
              !pointsListOpen && "pointer-events-none",
            )}
          >
            <Button
              className="w-full shrink-0"
              onClick={() => {
                resetForm();
                setPointModalOpen(true);
              }}
            >
              Добавить точку
            </Button>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
              <h3
                id="trip-points-heading"
                className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                Список ({points.length})
              </h3>
              <ul className="space-y-2" aria-labelledby="trip-points-heading">
                {points.map((point, index) => (
                  <li
                    key={point.id}
                    className={cn(
                      "relative cursor-pointer rounded-lg border bg-background/80 p-2 transition-[background-color,box-shadow,transform] duration-200 hover:bg-muted/50",
                      "motion-safe:active:scale-[0.99]",
                      "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:zoom-in-95 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:ease-out",
                      focusedPointId === point.id &&
                        "shadow-md ring-2 ring-primary/35 ring-offset-1 ring-offset-background",
                    )}
                    style={lvStaggerStyle(index, 40)}
                    onClick={() => {
                      setFocusedPointId(point.id);
                      setSelectedLat(point.coordinates.lat);
                      setSelectedLng(point.coordinates.lng);
                    }}
                  >
                    <div className="absolute top-2 right-2 z-1 flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7"
                        aria-label={`Изменить точку ${point.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          beginEdit(point);
                        }}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="size-7 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label={`Удалить точку ${point.title}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          void removePoint(point.id);
                        }}
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted/30">
                        {point.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- user-provided or S3 preview image
                          <img
                            src={point.imageUrl}
                            alt=""
                            className="h-full w-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                            Нет фото
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {point.title}
                        </p>
                        <p className="mt-1">
                          <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {categoryLabelByValue[point.category]}
                          </span>
                        </p>
                        {point.description ? (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                            {point.description}
                          </p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {point.coordinates.lat.toFixed(5)},{" "}
                          {point.coordinates.lng.toFixed(5)}
                        </p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </aside>

      {pointModalOpen ? (
        <div
          className={cn(
            "fixed inset-0 z-[2120] flex items-center justify-center bg-black/45 px-4 py-6",
            LV_MODAL_BACKDROP_ENTER_CLASS,
          )}
        >
          <div
            className={cn(
              "w-[min(100%,70rem)] max-h-[92vh] overflow-y-auto rounded-2xl border bg-card p-4 shadow-2xl",
              LV_MODAL_PANEL_ENTER_CLASS,
            )}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                {editingId ? "Редактирование точки" : "Новая точка"}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPointModalOpen(false);
                  if (!editingId) resetForm();
                }}
              >
                Закрыть
              </Button>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
              <section className="h-[52vh] rounded-xl border bg-card p-2">
                <TripMap
                  center={
                    selectedLat !== null && selectedLng !== null
                      ? { lat: selectedLat, lng: selectedLng }
                      : center
                  }
                  points={points}
                  onAddGooglePoi={addGooglePoiToTrip}
                  selectedPoint={
                    selectedLat !== null && selectedLng !== null
                      ? { lat: selectedLat, lng: selectedLng }
                      : null
                  }
                  focusedPointId={focusedPointId}
                  onPointPick={(point) => {
                    setFocusedPointId(point.id);
                    setSelectedLat(point.coordinates.lat);
                    setSelectedLng(point.coordinates.lng);
                  }}
                  onSelect={(lat, lng) => {
                    setFocusedPointId(null);
                    setSelectedLat(lat);
                    setSelectedLng(lng);
                  }}
                />
              </section>

              <div className="space-y-2">
                <input
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  placeholder="Название"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
                <textarea
                  className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  placeholder="Описание"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Превью места
                  </p>
                  <input
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    placeholder="https://.../image.jpg"
                    value={imageUrl}
                    onChange={(event) => setImageUrl(event.target.value)}
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={uploadBusy}
                      onClick={() => imageFileRef.current?.click()}
                    >
                      {uploadBusy ? "Загружаем..." : "Загрузить в S3"}
                    </Button>
                    <input
                      ref={imageFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void onPickPointImage(file);
                      }}
                    />
                    {imageUrl ? (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setImageUrl("")}
                      >
                        Убрать
                      </Button>
                    ) : null}
                  </div>
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- user-provided or S3 preview image
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-20 w-full rounded-md border object-cover"
                      referrerPolicy="no-referrer"
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                  ) : null}
                </div>
                <select
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  value={category}
                  onChange={(event) =>
                    setCategory(event.target.value as TripPoint["category"])
                  }
                >
                  {categoryOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <input
                  type="datetime-local"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                  value={plannedAt}
                  onChange={(event) => setPlannedAt(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Координаты:{" "}
                  {selectedLat !== null && selectedLng !== null
                    ? `${selectedLat.toFixed(5)}, ${selectedLng.toFixed(5)}`
                    : "не выбраны"}
                </p>
                <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
                  <p className="text-xs font-medium text-muted-foreground">
                    Поиск места на карте
                  </p>
                  <div className="flex gap-2">
                    <input
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      placeholder="Например, Красная площадь, Москва"
                      value={placeQuery}
                      onChange={(event) => setPlaceQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void searchPlace();
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={geocodeBusy}
                      onClick={() => void searchPlace()}
                    >
                      {geocodeBusy ? "Ищем..." : "Найти"}
                    </Button>
                  </div>
                  {geocodeResults.length > 0 ? (
                    <ul className="max-h-40 space-y-1 overflow-auto">
                      {geocodeResults.map((item) => (
                        <li key={`${item.label}-${item.lat}-${item.lng}`}>
                          <button
                            type="button"
                            className="w-full rounded-md border bg-background px-2 py-1.5 text-left text-xs hover:bg-muted"
                            onClick={() => {
                              const placeId = (
                                item as GeocodeResult & { placeId?: string }
                              ).placeId;
                              setSelectedLat(item.lat);
                              setSelectedLng(item.lng);
                              setPlaceQuery(item.label);
                              if (!title.trim()) {
                                setTitle(
                                  item.label.split(",")[0] ?? item.label,
                                );
                              }
                              void fillPreviewFromPlaceId(placeId);
                            }}
                          >
                            <span className="block font-medium">
                              {item.label}
                            </span>
                            <span className="text-muted-foreground">
                              {item.lat.toFixed(5)}, {item.lng.toFixed(5)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button disabled={isSaving} onClick={savePoint}>
                    {editingId ? "Сохранить" : "Добавить"}
                  </Button>
                  {editingId ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        resetForm();
                        setPointModalOpen(false);
                      }}
                    >
                      Отмена
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
