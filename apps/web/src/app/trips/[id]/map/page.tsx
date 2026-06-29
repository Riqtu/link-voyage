"use client";

import { cn } from "@/lib/utils";
import { TripMapLazy } from "./components/trip-map-lazy";
import { TripMapPointsDrawer } from "./components/trip-map-points-drawer";
import { TripPointFormModal } from "./components/trip-point-form-modal";
import { useTripMapPage } from "./hooks/use-trip-map-page";
import type { GeocodeResult } from "./lib/types";

export default function TripMapPage() {
  const m = useTripMapPage();

  return (
    <main className="relative min-h-screen">
      <section className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top))] z-0 bottom-[var(--lv-trip-tab-recess)]">
        {m.isLoading ? (
          <p className="p-3 text-sm text-muted-foreground">Загружаем карту...</p>
        ) : (
          <TripMapLazy
            center={m.center}
            points={m.points}
            focusedPointId={m.focusedPointId}
            onAddGooglePoi={m.addGooglePoiToTrip}
            onPointPick={(point) => {
              m.setFocusedPointId(point.id);
              m.setSelectedLat(point.coordinates.lat);
              m.setSelectedLng(point.coordinates.lng);
            }}
            onSelect={(lat, lng) => {
              m.setFocusedPointId(null);
              m.setSelectedLat(lat);
              m.setSelectedLng(lng);
            }}
          />
        )}
      </section>

      <header className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top)+0.25rem)] z-40 px-4 py-3 sm:px-6">
        <div className="mx-auto w-full max-w-7xl rounded-xl border bg-card/90 px-3 py-3 shadow-lg backdrop-blur sm:px-4">
          <h1 className="text-lg font-semibold sm:text-2xl">Карта поездки</h1>
        </div>
      </header>

      {m.error ? (
        <div
          className={cn(
            "fixed top-[calc(8rem+env(safe-area-inset-top))] left-1/2 z-20 w-[min(92vw,42rem)] -translate-x-1/2 rounded-lg border border-destructive/40 bg-card/95 px-4 py-2 text-sm text-destructive shadow-lg backdrop-blur",
            "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-2 motion-safe:zoom-in-95 motion-safe:duration-300 motion-safe:ease-out motion-safe:fill-mode-both",
          )}
          role="alert"
        >
          {m.error}
        </div>
      ) : null}

      <TripMapPointsDrawer
        points={m.points}
        pointsListOpen={m.pointsListOpen}
        onToggleList={m.togglePointsList}
        focusedPointId={m.focusedPointId}
        onFocusPoint={(point) => {
          m.setFocusedPointId(point.id);
          m.setSelectedLat(point.coordinates.lat);
          m.setSelectedLng(point.coordinates.lng);
        }}
        onAddPoint={() => {
          m.resetForm();
          m.setPointModalOpen(true);
        }}
        onEditPoint={m.beginEdit}
        onRemovePoint={(pointId) => void m.removePoint(pointId)}
      />

      <TripPointFormModal
        open={m.pointModalOpen}
        editingId={m.editingId}
        pageCenter={m.center}
        points={m.points}
        title={m.title}
        onTitleChange={m.setTitle}
        description={m.description}
        onDescriptionChange={m.setDescription}
        imageUrl={m.imageUrl}
        onImageUrlChange={m.setImageUrl}
        uploadBusy={m.uploadBusy}
        imageFileRef={m.imageFileRef}
        onPickPointImage={(file) => void m.onPickPointImage(file)}
        category={m.category}
        onCategoryChange={m.setCategory}
        plannedAt={m.plannedAt}
        onPlannedAtChange={m.setPlannedAt}
        selectedLat={m.selectedLat}
        selectedLng={m.selectedLng}
        placeQuery={m.placeQuery}
        onPlaceQueryChange={m.setPlaceQuery}
        geocodeBusy={m.geocodeBusy}
        geocodeResults={m.geocodeResults}
        onSearchPlace={() => void m.searchPlace()}
        onGeocodeResultPick={async (item) => {
          const placeId = (item as GeocodeResult & { placeId?: string })
            .placeId;
          m.setSelectedLat(item.lat);
          m.setSelectedLng(item.lng);
          m.setPlaceQuery(item.label);
          if (!m.title.trim()) {
            m.setTitle(item.label.split(",")[0] ?? item.label);
          }
          await m.enrichFromGooglePlaceId(placeId);
        }}
        isSaving={m.isSaving}
        onSave={() => void m.savePoint()}
        onClose={() => {
          m.setPointModalOpen(false);
          if (!m.editingId) m.resetForm();
        }}
        onCancelEdit={() => {
          m.resetForm();
          m.setPointModalOpen(false);
        }}
        focusedPointId={m.focusedPointId}
        onFocusedPointIdChange={m.setFocusedPointId}
        onSelectCoords={(lat, lng) => {
          m.setSelectedLat(lat);
          m.setSelectedLng(lng);
        }}
        onPointPick={(point) => {
          m.setFocusedPointId(point.id);
          m.setSelectedLat(point.coordinates.lat);
          m.setSelectedLng(point.coordinates.lng);
        }}
        onAddGooglePoi={m.addGooglePoiToTrip}
      />
    </main>
  );
}
