"use client";

import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchGooglePlacePreviewPatch } from "../lib/google-place-preview";
import type { GeocodeResult, TripPoint } from "../lib/types";
import { useMapPointsListPersist } from "./use-map-points-list-persist";

export function useTripMapPage() {
  const { id: tripId } = useParams<{ id: string }>();
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
  const { pointsListOpen, togglePointsList } = useMapPointsListPersist(tripId);

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
        const result = await api.tripPoint.list.query({ tripId });
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
    [tripId, router],
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
          tripId,
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
        tripId,
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

  async function enrichFromGooglePlaceId(placeId?: string) {
    if (!placeId?.trim()) return;
    const patch = await fetchGooglePlacePreviewPatch(placeId.trim());
    if (!patch) return;
    if (patch.title) setTitle(patch.title);
    for (const line of patch.descriptionHints) {
      setDescription((prev) => prev || line);
    }
    if (patch.imageUrl) setImageUrl(patch.imageUrl);
  }

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
          tripId,
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
    [tripId, loadPoints],
  );

  return {
    tripId,
    points,
    center,
    isLoading,
    error,
    pointsListOpen,
    togglePointsList,
    focusedPointId,
    selectedLat,
    selectedLng,
    pointModalOpen,
    setPointModalOpen,
    editingId,
    title,
    setTitle,
    description,
    setDescription,
    imageUrl,
    setImageUrl,
    category,
    setCategory,
    plannedAt,
    setPlannedAt,
    placeQuery,
    setPlaceQuery,
    geocodeBusy,
    geocodeResults,
    isSaving,
    uploadBusy,
    imageFileRef,
    resetForm,
    savePoint,
    removePoint,
    onPickPointImage,
    searchPlace,
    beginEdit,
    enrichFromGooglePlaceId,
    addGooglePoiToTrip,
    setFocusedPointId,
    setSelectedLat,
    setSelectedLng,
  };
}
