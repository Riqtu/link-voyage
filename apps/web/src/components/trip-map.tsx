"use client";

import {
  GOOGLE_MAP_MARKER_LIBRARY,
  GOOGLE_MAPS_JS_LOADER_ID,
} from "@/lib/google-maps-js-loader";
import { GoogleMap, useJsApiLoader } from "@react-google-maps/api";
import { useEffect, useRef, useState } from "react";

type TripPoint = {
  id: string;
  title: string;
  category: "stay" | "food" | "sight" | "transport" | "other";
  coordinates: { lat: number; lng: number };
};

function AdvancedMarker(props: {
  map: google.maps.Map | null;
  position: google.maps.LatLngLiteral;
  title?: string;
}) {
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null,
  );

  useEffect(() => {
    if (!props.map || !google.maps.marker?.AdvancedMarkerElement) return;
    if (!markerRef.current) {
      markerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map: props.map,
        position: props.position,
        title: props.title,
      });
      return;
    }

    markerRef.current.map = props.map;
    markerRef.current.position = props.position;
    if (props.title) {
      markerRef.current.title = props.title;
    }
  }, [props.map, props.position, props.title]);

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
  onSelect(lat: number, lng: number): void;
}) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAP_ID ?? "DEMO_MAP_ID";
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_JS_LOADER_ID,
    googleMapsApiKey: apiKey ?? "",
    libraries: GOOGLE_MAP_MARKER_LIBRARY,
  });

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
      options={{ mapId }}
      onLoad={(map) => {
        setMap(map);
      }}
      onUnmount={() => {
        setMap(null);
      }}
      onClick={(event) => {
        const lat = event.latLng?.lat();
        const lng = event.latLng?.lng();
        if (lat !== undefined && lng !== undefined) {
          props.onSelect(lat, lng);
        }
      }}
    >
      {props.points.map((point) => (
        <AdvancedMarker
          key={point.id}
          map={map}
          position={{ lat: point.coordinates.lat, lng: point.coordinates.lng }}
          title={`${point.title} (${point.category})`}
        />
      ))}
    </GoogleMap>
  );
}
