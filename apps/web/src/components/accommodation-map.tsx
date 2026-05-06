"use client";

import { AccommodationStatusBadgeFromUnknown } from "@/components/accommodation-status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  GOOGLE_MAP_MARKER_LIBRARY,
  GOOGLE_MAPS_JS_LOADER_ID,
} from "@/lib/google-maps-js-loader";
import { cn } from "@/lib/utils";
import { GoogleMap, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import { ExternalLink, ListOrdered } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

function formatRubFromUsd(priceUsd: number, rubPerUsd: number): string {
  const rub = priceUsd * rubPerUsd;
  const whole = rub % 1 === 0;
  return rub.toLocaleString("ru-RU", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

type AccommodationPoint = {
  id: string;
  title: string;
  coordinates: { lat: number; lng: number } | null;
  locationLabel?: string;
  status?: "shortlisted" | "rejected" | "booked";
  noLongerAvailable?: boolean;
  price?: number | null;
  currency?: string;
  image?: string;
  sourceUrl?: string;
};

function AdvancedMarker(props: {
  map: google.maps.Map | null;
  pointId?: string;
  position: google.maps.LatLngLiteral;
  title?: string;
  onClick?(pointId?: string): void;
}) {
  const { map, pointId, position, title, onClick } = props;
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null,
  );

  useEffect(() => {
    if (!map || !google.maps.marker?.AdvancedMarkerElement) return;
    if (!markerRef.current) {
      markerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map,
        position,
        title,
      });
      return;
    }
    markerRef.current.map = map;
    markerRef.current.position = position;
    if (title) {
      markerRef.current.title = title;
    }
  }, [map, position, title]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !onClick) return;
    const listener = marker.addListener("gmp-click", () => {
      onClick(pointId);
    });
    return () => listener.remove();
  }, [onClick, pointId, position]);

  useEffect(() => {
    return () => {
      if (markerRef.current) {
        markerRef.current.map = null;
      }
    };
  }, []);

  return null;
}

export function AccommodationMap(props: {
  center: { lat: number; lng: number };
  points: AccommodationPoint[];
  selected?: { lat: number; lng: number } | null;
  onSelect?(lat: number, lng: number): void;
  /** Прокрутить страницу к карточке варианта в списке (например со страницы сравнения жилья) */
  onJumpToList?(pointId: string): void;
  /** Сфокусировать маркер и открыть балун (nonce меняется при повторном запросе того же id) */
  focusRequest?: { id: string; nonce: number } | null;
  onFocusRequestHandled?(): void;
  /** Оценка в ₽ для подписей в USD (курс ЦБ с бэкенда) */
  rubPerUsd?: number | null;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "DEMO_MAP_ID";
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_JS_LOADER_ID,
    googleMapsApiKey: apiKey ?? "",
    libraries: GOOGLE_MAP_MARKER_LIBRARY,
  });

  const coords = useMemo(
    () =>
      props.points
        .map((point) => point.coordinates)
        .filter(
          (value): value is { lat: number; lng: number } => value !== null,
        ),
    [props.points],
  );
  const [activePointId, setActivePointId] = useState<string | null>(null);
  const activePoint = useMemo(
    () => props.points.find((point) => point.id === activePointId) ?? null,
    [activePointId, props.points],
  );

  useEffect(() => {
    if (!map || !isLoaded || !props.focusRequest) return;
    const { id } = props.focusRequest;
    const point = props.points.find((p) => p.id === id);
    if (!point?.coordinates) {
      props.onFocusRequestHandled?.();
      return;
    }
    map.panTo(point.coordinates);
    map.setZoom(Math.max(map.getZoom() ?? 14, 15));
    setActivePointId(id);
    props.onFocusRequestHandled?.();
  }, [
    map,
    isLoaded,
    props.focusRequest,
    props.points,
    props.onFocusRequestHandled,
  ]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    if (props.selected) {
      map.panTo(props.selected);
      map.setZoom(Math.max(map.getZoom() ?? 14, 14));
      return;
    }
    if (coords.length >= 2) {
      const bounds = new google.maps.LatLngBounds();
      coords.forEach((item) => bounds.extend(item));
      map.fitBounds(bounds, 24);
      return;
    }
    if (coords.length === 1) {
      map.panTo(coords[0]);
      map.setZoom(14);
      return;
    }
    map.panTo(props.center);
    map.setZoom(12);
  }, [coords, isLoaded, map, props.center, props.selected]);

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
      center={props.center}
      zoom={12}
      mapContainerStyle={{
        height: "100%",
        width: "100%",
        borderRadius: "0.75rem",
      }}
      options={{ mapId, mapTypeControl: false }}
      onLoad={(map) => {
        setMap(map);
      }}
      onUnmount={() => {
        setMap(null);
      }}
      onClick={(event) => {
        setActivePointId(null);
        const lat = event.latLng?.lat();
        const lng = event.latLng?.lng();
        if (lat !== undefined && lng !== undefined) {
          props.onSelect?.(lat, lng);
        }
      }}
    >
      {props.points.map((point) => {
        if (!point.coordinates) return null;
        return (
          <AdvancedMarker
            key={point.id}
            map={map}
            pointId={point.id}
            position={{
              lat: point.coordinates.lat,
              lng: point.coordinates.lng,
            }}
            title={point.title}
            onClick={(pointId) => {
              setActivePointId(pointId ?? null);
            }}
          />
        );
      })}

      {activePoint?.coordinates ? (
        <InfoWindowF
          position={{
            lat: activePoint.coordinates.lat,
            lng: activePoint.coordinates.lng,
          }}
          options={{
            headerDisabled: true,
            pixelOffset: new google.maps.Size(0, -10),
            maxWidth: 280,
          }}
          onCloseClick={() => setActivePointId(null)}
        >
          <div
            className={cn(
              "flex min-h-0 w-full min-w-0 max-w-full flex-col text-sm transition-opacity duration-300",
              activePoint.noLongerAvailable && "opacity-[0.52]",
            )}
            style={{
              background: "var(--card)",
              color: "var(--card-foreground)",
            }}
          >
            <div className="accommodation-map-infowindow-scroll box-border max-h-[min(92vh,820px)] min-h-0 w-full min-w-0 overflow-x-hidden overflow-y-auto p-3 pb-4">
              {activePoint.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- external preview urls
                <img
                  src={activePoint.image}
                  alt=""
                  className="mb-2 h-20 w-full min-w-0 max-h-20 max-w-full shrink-0 rounded-md object-cover"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              <p
                className="break-words font-semibold leading-snug [overflow-wrap:anywhere]"
                style={{ color: "var(--card-foreground)" }}
              >
                {activePoint.title}
              </p>
              {activePoint.locationLabel ? (
                <p
                  className="mt-1 break-words text-xs leading-snug [overflow-wrap:anywhere]"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {activePoint.locationLabel}
                </p>
              ) : null}
              <div
                className="mt-1 flex flex-wrap items-center gap-2 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                <AccommodationStatusBadgeFromUnknown
                  status={activePoint.status}
                />
                {activePoint.price !== null &&
                activePoint.price !== undefined &&
                activePoint.currency ? (
                  <span className="flex flex-wrap items-baseline gap-x-1 gap-y-0.5">
                    <span>
                      {activePoint.price} {activePoint.currency}
                    </span>
                    {activePoint.currency.trim().toUpperCase() === "USD" &&
                    props.rubPerUsd != null &&
                    Number.isFinite(props.rubPerUsd) &&
                    Number.isFinite(activePoint.price) ? (
                      <span title="Ориентировочно по курсу ЦБ РФ">
                        ( ≈{" "}
                        {formatRubFromUsd(
                          activePoint.price as number,
                          props.rubPerUsd,
                        )}{" "}
                        ₽)
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
              {activePoint.sourceUrl ? (
                <a
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "mt-2 inline-flex w-full justify-center gap-1.5 break-all text-xs no-underline",
                  )}
                  href={activePoint.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <ExternalLink
                    className="size-3 shrink-0 opacity-80"
                    aria-hidden
                  />
                  Открыть источник
                </a>
              ) : null}
              {props.onJumpToList ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mt-3 w-full gap-1.5 text-xs"
                  onClick={() => {
                    props.onJumpToList?.(activePoint.id);
                    setActivePointId(null);
                  }}
                >
                  <ListOrdered className="size-3.5 shrink-0" aria-hidden />
                  Показать в списке
                </Button>
              ) : null}
            </div>
          </div>
        </InfoWindowF>
      ) : null}

      {props.selected ? (
        <AdvancedMarker
          map={map}
          position={{ lat: props.selected.lat, lng: props.selected.lng }}
        />
      ) : null}
    </GoogleMap>
  );
}
