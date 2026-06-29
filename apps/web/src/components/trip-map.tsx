"use client";

import { GoogleMapMarker } from "@/components/google-map-marker";
import { Button } from "@/components/ui/button";
import {
  googleMapsLoadErrorMessage,
  googleMapsLoaderLibraries,
  GOOGLE_MAPS_JS_LOADER_ID,
  resolvePublicGoogleMapId,
  withGoogleMapId,
} from "@/lib/google-maps-js-loader";
import { cn } from "@/lib/utils";
import { GoogleMap, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TripPoint = {
  id: string;
  title: string;
  description?: string;
  category: "stay" | "food" | "sight" | "transport" | "other";
  coordinates: { lat: number; lng: number };
  imageUrl?: string | null;
};

type GooglePoiPreview = {
  placeId: string;
  title: string;
  description?: string;
  category?: string;
  tripCategory: TripPoint["category"];
  imageUrl?: string;
  coordinates: { lat: number; lng: number };
};

type PlacePhotoLike = {
  getURI?(options?: { maxWidthPx?: number; maxHeightPx?: number }): string;
  getUrl?(options?: { maxWidth?: number; maxHeight?: number }): string;
};

type PlaceLike = {
  displayName?: { text?: string };
  formattedAddress?: string;
  primaryType?: string;
  photos?: PlacePhotoLike[];
  fetchFields(request: { fields: string[] }): Promise<void>;
};

type PlaceConstructor = new (options: {
  id: string;
  requestedLanguage?: string;
}) => PlaceLike;

type PlacesLibraryLike = {
  Place?: PlaceConstructor;
};

const CATEGORY_MARKER_STYLE: Record<
  TripPoint["category"],
  { emoji: string; bg: string; border: string; text: string }
> = {
  stay: { emoji: "🏨", bg: "#e0f2fe", border: "#0284c7", text: "#0c4a6e" },
  food: { emoji: "🍽️", bg: "#fef3c7", border: "#d97706", text: "#7c2d12" },
  sight: { emoji: "📍", bg: "#fee2e2", border: "#dc2626", text: "#7f1d1d" },
  transport: { emoji: "🚌", bg: "#dcfce7", border: "#16a34a", text: "#14532d" },
  other: { emoji: "🧭", bg: "#ede9fe", border: "#7c3aed", text: "#4c1d95" },
};

const CATEGORY_LABEL: Record<TripPoint["category"], string> = {
  stay: "Проживание",
  food: "Еда и кафе",
  sight: "Достопримечательность",
  transport: "Транспорт",
  other: "Другое место",
};

function TripPointMarker(props: {
  map: google.maps.Map | null;
  useAdvancedMarkers: boolean;
  pointId?: string;
  position: google.maps.LatLngLiteral;
  title?: string;
  category: TripPoint["category"];
  imageUrl?: string | null;
  isPreview?: boolean;
  isHighlighted?: boolean;
  onClick?(pointId?: string): void;
}) {
  const { pointId, onClick } = props;
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [advancedContent, setAdvancedContent] = useState<HTMLDivElement | null>(
    null,
  );
  const style = CATEGORY_MARKER_STYLE[props.category];

  useEffect(() => {
    if (!contentRef.current) {
      const markerEl = document.createElement("div");
      markerEl.style.width = "34px";
      markerEl.style.height = "34px";
      markerEl.style.borderRadius = "9999px";
      markerEl.style.display = "flex";
      markerEl.style.alignItems = "center";
      markerEl.style.justifyContent = "center";
      markerEl.style.boxSizing = "border-box";
      markerEl.style.boxShadow = "0 2px 6px rgba(0,0,0,0.22)";
      contentRef.current = markerEl;
    }
    const markerEl = contentRef.current;
    if (!markerEl) return;

    const hasPreviewImage =
      typeof props.imageUrl === "string" && props.imageUrl.trim().length > 0;
    if (hasPreviewImage && !props.isPreview) {
      markerEl.style.border = "2px solid rgba(255,255,255,0.92)";
      markerEl.style.backgroundImage = `url("${props.imageUrl}")`;
      markerEl.style.backgroundSize = "cover";
      markerEl.style.backgroundPosition = "center";
      markerEl.style.backgroundRepeat = "no-repeat";
      markerEl.style.color = "transparent";
      markerEl.textContent = "";
    } else {
      markerEl.style.border = `2px solid ${style.border}`;
      markerEl.style.background = style.bg;
      markerEl.style.backgroundImage = "";
      markerEl.style.backgroundSize = "";
      markerEl.style.backgroundPosition = "";
      markerEl.style.backgroundRepeat = "";
      markerEl.style.color = style.text;
      markerEl.textContent = props.isPreview ? "🎯" : style.emoji;
    }
    markerEl.style.opacity = props.isPreview ? "0.9" : "1";
    if (props.isPreview) {
      markerEl.style.transform = "scale(1.08)";
      markerEl.classList.remove("lv-map-marker--pulse");
    } else if (props.isHighlighted) {
      markerEl.style.transform = "";
      markerEl.classList.add("lv-map-marker--pulse");
    } else {
      markerEl.style.transform = "scale(1)";
      markerEl.classList.remove("lv-map-marker--pulse");
    }
    setAdvancedContent(markerEl);
  }, [
    props.category,
    props.imageUrl,
    props.isHighlighted,
    props.isPreview,
    style.bg,
    style.border,
    style.emoji,
    style.text,
  ]);

  const classicIcon = useMemo((): google.maps.Icon | google.maps.Symbol => {
    const hasPreviewImage =
      typeof props.imageUrl === "string" && props.imageUrl.trim().length > 0;
    if (hasPreviewImage && !props.isPreview) {
      return {
        url: props.imageUrl!,
        scaledSize: new google.maps.Size(34, 34),
        anchor: new google.maps.Point(17, 17),
      };
    }
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: style.bg,
      fillOpacity: 1,
      strokeColor: style.border,
      strokeWeight: 2,
      scale: props.isPreview ? 13 : 11,
    };
  }, [props.imageUrl, props.isPreview, style.bg, style.border]);

  const classicLabel = useMemo((): google.maps.MarkerLabel | undefined => {
    const hasPreviewImage =
      typeof props.imageUrl === "string" && props.imageUrl.trim().length > 0;
    if (hasPreviewImage && !props.isPreview) return undefined;
    return {
      text: props.isPreview ? "🎯" : style.emoji,
      color: style.text,
      fontSize: "15px",
    };
  }, [props.imageUrl, props.isPreview, style.emoji, style.text]);

  return (
    <GoogleMapMarker
      map={props.map}
      useAdvancedMarkers={props.useAdvancedMarkers}
      position={props.position}
      title={props.title}
      content={advancedContent}
      classicIcon={classicIcon}
      classicLabel={classicLabel}
      onClick={onClick ? () => onClick(pointId) : undefined}
    />
  );
}

export function TripMap(props: {
  center: { lat: number; lng: number };
  points: TripPoint[];
  selectedPoint?: { lat: number; lng: number } | null;
  focusedPointId?: string | null;
  onPointPick?(point: TripPoint): void;
  onSelect(lat: number, lng: number): void;
  onAddGooglePoi?(poi: {
    title: string;
    description?: string;
    imageUrl?: string;
    coordinates: { lat: number; lng: number };
    category: TripPoint["category"];
  }): Promise<void> | void;
}) {
  const {
    center,
    points,
    selectedPoint,
    focusedPointId,
    onPointPick,
    onSelect,
    onAddGooglePoi,
  } = props;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = resolvePublicGoogleMapId();
  const useAdvancedMarkers = mapId !== null;
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_JS_LOADER_ID,
    googleMapsApiKey: apiKey ?? "",
    libraries: googleMapsLoaderLibraries(mapId),
  });
  const [selectedMarkerPointId, setSelectedMarkerPointId] = useState<
    string | null
  >(null);
  const [activeGooglePoi, setActiveGooglePoi] =
    useState<GooglePoiPreview | null>(null);
  const [addingGooglePoiId, setAddingGooglePoiId] = useState<string | null>(
    null,
  );
  const activePointId = focusedPointId ?? selectedMarkerPointId;
  const activePoint = useMemo(
    () => points.find((point) => point.id === activePointId) ?? null,
    [activePointId, points],
  );

  useEffect(() => {
    if (!map) return;
    const panorama = map.getStreetView();
    panorama.setOptions({
      // В Street View переносим "правые" кнопки на левую сторону.
      zoomControlOptions: {
        position: google.maps.ControlPosition.LEFT_CENTER,
      },
      panControlOptions: {
        position: google.maps.ControlPosition.LEFT_CENTER,
      },
      fullscreenControlOptions: {
        position: google.maps.ControlPosition.LEFT_CENTER,
      },
      // // Верхние элементы панели смещаем к центру.
      addressControlOptions: {
        position: google.maps.ControlPosition.LEFT_CENTER,
      },
      // motionTrackingControlOptions: {
      //   position: google.maps.ControlPosition.INLINE_START_BLOCK_START,
      // },
    });
  }, [map]);

  useEffect(() => {
    if (!focusedPointId) return;
    const target = points.find((p) => p.id === focusedPointId);
    if (!target) return;
    if (map) {
      map.panTo(target.coordinates);
      map.setZoom(Math.max(map.getZoom() ?? 14, 14));
    }
  }, [focusedPointId, points, map]);

  const loadGooglePoiPreview = useCallback(
    async (placeId: string, coordinates: { lat: number; lng: number }) => {
      const placesLib = (await google.maps.importLibrary(
        "places",
      )) as PlacesLibraryLike;
      const Place = placesLib.Place;
      if (!Place) return;
      const place = new Place({ id: placeId, requestedLanguage: "ru" });
      await place.fetchFields({
        fields: ["displayName", "formattedAddress", "primaryType", "photos"],
      });

      const photo = place.photos?.[0];
      const photoUrl =
        photo?.getURI?.({
          maxWidthPx: 640,
          maxHeightPx: 360,
        }) ??
        photo?.getUrl?.({
          maxWidth: 640,
          maxHeight: 360,
        });
      const categoryRaw = place.primaryType;
      const category = categoryRaw
        ? categoryRaw
            .split("_")
            .map((part) => part[0]?.toUpperCase() + part.slice(1))
            .join(" ")
        : "Google POI";
      const tripCategory: TripPoint["category"] =
        categoryRaw === "lodging"
          ? "stay"
          : categoryRaw === "restaurant" ||
              categoryRaw === "cafe" ||
              categoryRaw === "bar"
            ? "food"
            : categoryRaw === "bus_station" ||
                categoryRaw === "subway_station" ||
                categoryRaw === "train_station" ||
                categoryRaw === "airport"
              ? "transport"
              : categoryRaw === "tourist_attraction" ||
                  categoryRaw === "museum" ||
                  categoryRaw === "park"
                ? "sight"
                : "other";

      setActiveGooglePoi({
        placeId,
        title:
          place.displayName?.text ??
          place.formattedAddress?.split(",")[0]?.trim() ??
          "Точка",
        description: place.formattedAddress ?? undefined,
        category,
        tripCategory,
        imageUrl: photoUrl,
        coordinates,
      });
    },
    [],
  );

  if (!apiKey) {
    return (
      <p className="p-3 text-sm text-muted-foreground">
        Нет ключа Google Maps в env.
      </p>
    );
  }
  if (loadError) {
    return (
      <p className="p-3 text-sm text-destructive">
        {googleMapsLoadErrorMessage(loadError)}
      </p>
    );
  }
  if (!isLoaded) {
    return (
      <p className="p-3 text-sm text-muted-foreground">Загружаем карту...</p>
    );
  }

  return (
    <GoogleMap
      center={center}
      zoom={12}
      mapContainerStyle={{
        height: "100%",
        width: "100%",
        borderRadius: "0.75rem",
      }}
      options={withGoogleMapId(
        {
          mapTypeControl: false,
          zoomControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          gestureHandling: "greedy",
          zoomControlOptions: {
            position: google.maps.ControlPosition.LEFT_CENTER,
          },
          streetViewControlOptions: {
            position: google.maps.ControlPosition.LEFT_CENTER,
          },
          fullscreenControlOptions: {
            position: google.maps.ControlPosition.LEFT_CENTER,
          },
        },
        mapId,
      )}
      onLoad={(map) => {
        setMap(map);
      }}
      onUnmount={() => {
        setMap(null);
      }}
      onClick={(event) => {
        setSelectedMarkerPointId(null);
        const placeClickEvent = event as google.maps.IconMouseEvent;
        if (placeClickEvent.placeId) {
          placeClickEvent.stop();
          const lat = event.latLng?.lat();
          const lng = event.latLng?.lng();
          if (lat !== undefined && lng !== undefined) {
            void loadGooglePoiPreview(placeClickEvent.placeId, { lat, lng });
          }
          return;
        }
        setActiveGooglePoi(null);
        const lat = event.latLng?.lat();
        const lng = event.latLng?.lng();
        if (lat !== undefined && lng !== undefined) {
          onSelect(lat, lng);
        }
      }}
    >
      {points.map((point) => (
        <TripPointMarker
          key={point.id}
          map={map}
          useAdvancedMarkers={useAdvancedMarkers}
          pointId={point.id}
          position={{ lat: point.coordinates.lat, lng: point.coordinates.lng }}
          title={`${point.title} (${point.category})`}
          category={point.category}
          imageUrl={point.imageUrl}
          isHighlighted={activePointId === point.id}
          onClick={(pointId) => {
            if (!pointId) return;
            setActiveGooglePoi(null);
            setSelectedMarkerPointId(pointId);
            const selected = points.find((item) => item.id === pointId);
            if (selected) onPointPick?.(selected);
          }}
        />
      ))}
      {activePoint ? (
        <InfoWindowF
          position={activePoint.coordinates}
          onCloseClick={() => setSelectedMarkerPointId(null)}
          options={{
            headerDisabled: true,
            pixelOffset: new google.maps.Size(0, -8),
            maxWidth: 260,
          }}
        >
          <div className="min-w-[210px] max-w-[260px] rounded-xl border border-border/60 bg-card p-2.5 text-card-foreground shadow-md">
            {activePoint.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview from user/S3 url
              <img
                src={activePoint.imageUrl}
                alt=""
                className="mb-2 h-24 w-full rounded-lg border object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            <p className="truncate text-sm font-semibold">
              {activePoint.title}
            </p>
            <p className="mt-1">
              <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {CATEGORY_LABEL[activePoint.category]}
              </span>
            </p>
            {activePoint.description ? (
              <p
                className={cn(
                  "mt-1 text-xs leading-snug text-muted-foreground",
                  "line-clamp-3",
                )}
              >
                {activePoint.description}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {activePoint.coordinates.lat.toFixed(5)},{" "}
              {activePoint.coordinates.lng.toFixed(5)}
            </p>
          </div>
        </InfoWindowF>
      ) : null}
      {activeGooglePoi ? (
        <InfoWindowF
          position={activeGooglePoi.coordinates}
          onCloseClick={() => setActiveGooglePoi(null)}
          options={{
            headerDisabled: true,
            pixelOffset: new google.maps.Size(0, -8),
            maxWidth: 260,
          }}
        >
          <div className="min-w-[210px] max-w-[260px] rounded-xl border border-border/60 bg-card p-2.5 text-card-foreground shadow-md">
            {activeGooglePoi.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- image url returned by Google Places API
              <img
                src={activeGooglePoi.imageUrl}
                alt=""
                className="mb-2 h-24 w-full rounded-lg border object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            <p className="truncate text-sm font-semibold">
              {activeGooglePoi.title}
            </p>
            {activeGooglePoi.category ? (
              <p className="mt-1">
                <span className="inline-flex rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {activeGooglePoi.category}
                </span>
              </p>
            ) : null}
            {activeGooglePoi.description ? (
              <p className="mt-1 line-clamp-3 text-xs leading-snug text-muted-foreground">
                {activeGooglePoi.description}
              </p>
            ) : null}
            <p className="mt-1 text-[11px] text-muted-foreground">
              {activeGooglePoi.coordinates.lat.toFixed(5)},{" "}
              {activeGooglePoi.coordinates.lng.toFixed(5)}
            </p>
            {onAddGooglePoi ? (
              <Button
                size="sm"
                className="mt-2 h-8 w-full"
                disabled={addingGooglePoiId === activeGooglePoi.placeId}
                onClick={async () => {
                  setAddingGooglePoiId(activeGooglePoi.placeId);
                  try {
                    await onAddGooglePoi({
                      title: activeGooglePoi.title,
                      description: activeGooglePoi.description,
                      imageUrl: activeGooglePoi.imageUrl,
                      coordinates: activeGooglePoi.coordinates,
                      category: activeGooglePoi.tripCategory,
                    });
                    setActiveGooglePoi(null);
                  } finally {
                    setAddingGooglePoiId(null);
                  }
                }}
              >
                {addingGooglePoiId === activeGooglePoi.placeId
                  ? "Добавляем..."
                  : "Добавить"}
              </Button>
            ) : null}
          </div>
        </InfoWindowF>
      ) : null}
      {selectedPoint ? (
        <TripPointMarker
          key={`preview-${selectedPoint.lat}-${selectedPoint.lng}`}
          map={map}
          useAdvancedMarkers={useAdvancedMarkers}
          position={selectedPoint}
          title="Новая точка (предпросмотр)"
          category="other"
          isPreview
        />
      ) : null}
    </GoogleMap>
  );
}
