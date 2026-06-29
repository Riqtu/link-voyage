"use client";

import { useEffect, useRef } from "react";

type LatLngLiteral = google.maps.LatLngLiteral;

function useClassicMarker(props: {
  map: google.maps.Map | null;
  position: LatLngLiteral;
  title?: string;
  onClick?: () => void;
  icon?: string | google.maps.Icon | google.maps.Symbol;
  label?: google.maps.MarkerLabel;
}) {
  const markerRef = useRef<google.maps.Marker | null>(null);

  useEffect(() => {
    if (!props.map) return;
    try {
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({
          map: props.map,
          position: props.position,
          title: props.title,
          icon: props.icon,
          label: props.label,
        });
        return;
      }
      markerRef.current.setMap(props.map);
      markerRef.current.setPosition(props.position);
      if (props.title) markerRef.current.setTitle(props.title);
      if (props.icon !== undefined) markerRef.current.setIcon(props.icon);
      if (props.label !== undefined) markerRef.current.setLabel(props.label);
    } catch {
      markerRef.current?.setMap(null);
      markerRef.current = null;
    }
  }, [props.map, props.position, props.title, props.icon, props.label]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !props.onClick) return;
    const listener = marker.addListener("click", props.onClick);
    return () => listener.remove();
  }, [props.onClick]);

  useEffect(() => {
    return () => {
      markerRef.current?.setMap(null);
      markerRef.current = null;
    };
  }, []);
}

function useAdvancedMarker(props: {
  map: google.maps.Map | null;
  position: LatLngLiteral;
  title?: string;
  content?: HTMLElement | null;
  onClick?: () => void;
}) {
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(
    null,
  );

  useEffect(() => {
    if (!props.map || !google.maps.marker?.AdvancedMarkerElement) return;
    try {
      if (!markerRef.current) {
        const options: google.maps.marker.AdvancedMarkerElementOptions = {
          map: props.map,
          position: props.position,
        };
        if (props.title) options.title = props.title;
        if (props.content) options.content = props.content;
        markerRef.current = new google.maps.marker.AdvancedMarkerElement(
          options,
        );
        return;
      }
      markerRef.current.map = props.map;
      markerRef.current.position = props.position;
      if (props.title) markerRef.current.title = props.title;
      if (props.content) markerRef.current.content = props.content;
    } catch {
      if (markerRef.current) markerRef.current.map = null;
      markerRef.current = null;
    }
  }, [props.map, props.position, props.title, props.content]);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker || !props.onClick) return;
    const listener = marker.addListener("gmp-click", props.onClick);
    return () => listener.remove();
  }, [props.onClick]);

  useEffect(() => {
    return () => {
      if (markerRef.current) markerRef.current.map = null;
    };
  }, []);
}

export function GoogleMapMarker(props: {
  map: google.maps.Map | null;
  useAdvancedMarkers: boolean;
  position: LatLngLiteral;
  title?: string;
  onClick?: () => void;
  content?: HTMLElement | null;
  classicIcon?: string | google.maps.Icon | google.maps.Symbol;
  classicLabel?: google.maps.MarkerLabel;
}) {
  const advancedReady = props.useAdvancedMarkers && props.content !== null;

  useClassicMarker({
    map: advancedReady ? null : props.map,
    position: props.position,
    title: props.title,
    onClick: props.onClick,
    icon: props.classicIcon,
    label: props.classicLabel,
  });

  useAdvancedMarker({
    map: advancedReady ? props.map : null,
    position: props.position,
    title: props.title,
    content: props.content,
    onClick: props.onClick,
  });

  return null;
}
