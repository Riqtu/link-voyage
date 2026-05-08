"use client";

import {
  GOOGLE_MAP_MARKER_LIBRARY,
  GOOGLE_MAPS_JS_LOADER_ID,
} from "@/lib/google-maps-js-loader";
import { cn } from "@/lib/utils";
import { GoogleMap, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { useEffect, useMemo, useRef, useState } from "react";

type TripPoint = {
  id: string;
  title: string;
  description?: string;
  category: "stay" | "food" | "sight" | "transport" | "other";
  coordinates: { lat: number; lng: number };
  imageUrl?: string | null;
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

function AdvancedMarker(props: {
  map: google.maps.Map | null;
  pointId?: string;
  position: google.maps.LatLngLiteral;
  title?: string;
  category: TripPoint["category"];
  imageUrl?: string | null;
  isPreview?: boolean;
  onClick?(pointId?: string): void;
}) {
  const { pointId, onClick } = props;
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null,
  );
  const contentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!props.map || !google.maps.marker?.AdvancedMarkerElement) return;
    const style = CATEGORY_MARKER_STYLE[props.category];
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
    if (contentRef.current) {
      const hasPreviewImage =
        typeof props.imageUrl === "string" && props.imageUrl.trim().length > 0;
      if (hasPreviewImage && !props.isPreview) {
        contentRef.current.style.border = "2px solid rgba(255,255,255,0.92)";
        contentRef.current.style.backgroundImage = `url("${props.imageUrl}")`;
        contentRef.current.style.backgroundSize = "cover";
        contentRef.current.style.backgroundPosition = "center";
        contentRef.current.style.backgroundRepeat = "no-repeat";
        contentRef.current.style.color = "transparent";
        contentRef.current.textContent = "";
      } else {
        contentRef.current.style.border = `2px solid ${style.border}`;
        contentRef.current.style.background = style.bg;
        contentRef.current.style.backgroundImage = "";
        contentRef.current.style.backgroundSize = "";
        contentRef.current.style.backgroundPosition = "";
        contentRef.current.style.backgroundRepeat = "";
        contentRef.current.style.color = style.text;
        contentRef.current.textContent = props.isPreview ? "🎯" : style.emoji;
      }
      contentRef.current.style.opacity = props.isPreview ? "0.9" : "1";
      contentRef.current.style.transform = props.isPreview
        ? "scale(1.08)"
        : "scale(1)";
    }

    if (!markerRef.current) {
      markerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map: props.map,
        position: props.position,
        title: props.title,
        content: contentRef.current,
      });
      return;
    }

    markerRef.current.map = props.map;
    markerRef.current.position = props.position;
    if (props.title) {
      markerRef.current.title = props.title;
    }
    markerRef.current.content = contentRef.current;
  }, [
    props.map,
    props.position,
    props.title,
    props.category,
    props.isPreview,
    props.imageUrl,
  ]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !onClick) return;
    const listener = marker.addListener("gmp-click", () => {
      onClick?.(pointId);
    });
    return () => listener.remove();
  }, [onClick, pointId, props.position]);

  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.map = null;
      }
    };
  }, []);

  return null;
}

export function TripMap(props: {
  center: { lat: number; lng: number };
  points: TripPoint[];
  selectedPoint?: { lat: number; lng: number } | null;
  focusedPointId?: string | null;
  onPointPick?(point: TripPoint): void;
  onSelect(lat: number, lng: number): void;
}) {
  const {
    center,
    points,
    selectedPoint,
    focusedPointId,
    onPointPick,
    onSelect,
  } = props;
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "DEMO_MAP_ID";
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_JS_LOADER_ID,
    googleMapsApiKey: apiKey ?? "",
    libraries: GOOGLE_MAP_MARKER_LIBRARY,
  });
  const [selectedMarkerPointId, setSelectedMarkerPointId] = useState<
    string | null
  >(null);
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
        Не удалось загрузить Google Maps.
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
      options={{
        mapId,
        mapTypeControl: false,
        zoomControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        zoomControlOptions: {
          position: google.maps.ControlPosition.LEFT_CENTER,
        },
        streetViewControlOptions: {
          position: google.maps.ControlPosition.LEFT_CENTER,
        },
        fullscreenControlOptions: {
          position: google.maps.ControlPosition.LEFT_CENTER,
        },
      }}
      onLoad={(map) => {
        setMap(map);
      }}
      onUnmount={() => {
        setMap(null);
      }}
      onClick={(event) => {
        setSelectedMarkerPointId(null);
        const lat = event.latLng?.lat();
        const lng = event.latLng?.lng();
        if (lat !== undefined && lng !== undefined) {
          onSelect(lat, lng);
        }
      }}
    >
      {points.map((point) => (
        <AdvancedMarker
          key={point.id}
          map={map}
          pointId={point.id}
          position={{ lat: point.coordinates.lat, lng: point.coordinates.lng }}
          title={`${point.title} (${point.category})`}
          category={point.category}
          imageUrl={point.imageUrl}
          onClick={(pointId) => {
            if (!pointId) return;
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
          <div className="min-w-[180px] max-w-[240px]">
            {activePoint.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- preview from user/S3 url
              <img
                src={activePoint.imageUrl}
                alt=""
                className="mb-2 h-20 w-full rounded-md object-cover"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
            ) : null}
            <p className="text-sm font-semibold">{activePoint.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {activePoint.category}
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
          </div>
        </InfoWindowF>
      ) : null}
      {selectedPoint ? (
        <AdvancedMarker
          key={`preview-${selectedPoint.lat}-${selectedPoint.lng}`}
          map={map}
          position={selectedPoint}
          title="Новая точка (предпросмотр)"
          category="other"
          isPreview
        />
      ) : null}
    </GoogleMap>
  );
}
