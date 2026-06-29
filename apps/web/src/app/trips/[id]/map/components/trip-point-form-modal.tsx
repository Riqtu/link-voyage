"use client";

import { Button } from "@/components/ui/button";
import {
  LV_MODAL_BACKDROP_ENTER_CLASS,
  LV_MODAL_PANEL_ENTER_CLASS,
} from "@/lib/lv-motion";
import { cn } from "@/lib/utils";
import type { MutableRefObject } from "react";
import { TripMapLazy } from "./trip-map-lazy";
import { categoryOptions } from "../lib/category-meta";
import type { GeocodeResult, TripPoint } from "../lib/types";

/** Совместимо с элементом массива `points` для `@/components/trip-map` и с API `TripPoint`. */
export type TripMapSelectablePoint = {
  id: string;
  coordinates: { lat: number; lng: number };
};

type TripPointFormModalProps = {
  open: boolean;
  editingId: string | null;
  /** Центр полноэкранной карты; fallback для модалки, если координаты не выбраны */
  pageCenter: { lat: number; lng: number };
  points: TripPoint[];
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  imageUrl: string;
  onImageUrlChange: (value: string) => void;
  uploadBusy: boolean;
  imageFileRef: MutableRefObject<HTMLInputElement | null>;
  onPickPointImage: (file: File) => void | Promise<void>;
  category: TripPoint["category"];
  onCategoryChange: (value: TripPoint["category"]) => void;
  plannedAt: string;
  onPlannedAtChange: (value: string) => void;
  selectedLat: number | null;
  selectedLng: number | null;
  placeQuery: string;
  onPlaceQueryChange: (value: string) => void;
  geocodeBusy: boolean;
  geocodeResults: GeocodeResult[];
  onSearchPlace: () => void | Promise<void>;
  onGeocodeResultPick: (item: GeocodeResult) => void | Promise<void>;
  isSaving: boolean;
  onSave: () => void | Promise<void>;
  onClose: () => void;
  onCancelEdit: () => void;
  focusedPointId: string | null;
  onFocusedPointIdChange: (id: string | null) => void;
  onSelectCoords: (lat: number, lng: number) => void;
  onPointPick: (point: TripMapSelectablePoint) => void;
  onAddGooglePoi: (poi: {
    title: string;
    description?: string;
    imageUrl?: string;
    coordinates: { lat: number; lng: number };
    category: TripPoint["category"];
  }) => void | Promise<void>;
};

export function TripPointFormModal({
  open,
  editingId,
  pageCenter,
  points,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  imageUrl,
  onImageUrlChange,
  uploadBusy,
  imageFileRef,
  onPickPointImage,
  category,
  onCategoryChange,
  plannedAt,
  onPlannedAtChange,
  selectedLat,
  selectedLng,
  placeQuery,
  onPlaceQueryChange,
  geocodeBusy,
  geocodeResults,
  onSearchPlace,
  onGeocodeResultPick,
  isSaving,
  onSave,
  onClose,
  onCancelEdit,
  focusedPointId,
  onFocusedPointIdChange,
  onSelectCoords,
  onPointPick,
  onAddGooglePoi,
}: TripPointFormModalProps) {
  if (!open) return null;

  const mapCenter =
    selectedLat !== null && selectedLng !== null
      ? { lat: selectedLat, lng: selectedLng }
      : pageCenter;

  return (
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
          <Button variant="outline" size="sm" onClick={onClose}>
            Закрыть
          </Button>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
          <section className="h-[52vh] rounded-xl border bg-card p-2">
            <TripMapLazy
              center={mapCenter}
              points={points}
              onAddGooglePoi={onAddGooglePoi}
              selectedPoint={
                selectedLat !== null && selectedLng !== null
                  ? { lat: selectedLat, lng: selectedLng }
                  : null
              }
              focusedPointId={focusedPointId}
              onPointPick={(point) => {
                onPointPick(point);
              }}
              onSelect={(lat, lng) => {
                onFocusedPointIdChange(null);
                onSelectCoords(lat, lng);
              }}
            />
          </section>

          <div className="space-y-2">
            <input
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="Название"
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
            />
            <textarea
              className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="Описание"
              value={description}
              onChange={(event) => onDescriptionChange(event.target.value)}
            />
            <div className="space-y-2 rounded-lg border bg-muted/20 p-2.5">
              <p className="text-xs font-medium text-muted-foreground">
                Превью места
              </p>
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                placeholder="https://.../image.jpg"
                value={imageUrl}
                onChange={(event) => onImageUrlChange(event.target.value)}
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
                    onClick={() => onImageUrlChange("")}
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
                onCategoryChange(event.target.value as TripPoint["category"])
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
              onChange={(event) => onPlannedAtChange(event.target.value)}
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
                  onChange={(event) => onPlaceQueryChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void onSearchPlace();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={geocodeBusy}
                  onClick={() => void onSearchPlace()}
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
                        onClick={() => void onGeocodeResultPick(item)}
                      >
                        <span className="block font-medium">{item.label}</span>
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
              <Button disabled={isSaving} onClick={() => void onSave()}>
                {editingId ? "Сохранить" : "Добавить"}
              </Button>
              {editingId ? (
                <Button variant="outline" onClick={onCancelEdit}>
                  Отмена
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
