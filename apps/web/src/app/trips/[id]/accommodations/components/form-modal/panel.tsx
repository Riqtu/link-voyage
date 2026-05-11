"use client";

import { Button } from "@/components/ui/button";
import { LV_MODAL_PANEL_ENTER_CLASS } from "@/lib/lv-motion";
import { cn } from "@/lib/utils";
import { AccommodationFormGalleryFields } from "./gallery-fields";
import { AccommodationFormPricingFields } from "./pricing-fields";
import { AccommodationFormSourceFields } from "./source-fields";
import type { AccommodationFormModalPanelProps } from "./types";

export function AccommodationFormModalPanel(
  props: AccommodationFormModalPanelProps,
) {
  const {
    editingId,
    resetForm,
    onCreate,
    title,
    setTitle,
    provider,
    setProvider,
    pricingMode,
    setPricingMode,
    sourceUrl,
    setSourceUrl,
    previewBusy,
    geminiBusy,
    onFetchPreview,
    onGeminiEnrich,
    geminiHtmlDraft,
    setGeminiHtmlDraft,
    onGeminiEnrichFromHtml,
    locationLabel,
    setLocationLabel,
    setGeocodeResults,
    geocodeBusy,
    onGeocodeSearch,
    geocodeResults,
    setSelectedCoords,
    latInput,
    setLatInput,
    lngInput,
    setLngInput,
    selectedCoords,
    mapCenter,
    previewDescription,
    setPreviewDescription,
    previewImages,
    setPreviewImages,
    uploadBusy,
    galleryGeminiBusy,
    onUploadImages,
    manualImageUrlDraft,
    setManualImageUrlDraft,
    manualImageZoneDraft,
    setManualImageZoneDraft,
    addPreviewImageFromUrl,
    galleryHtmlDraft,
    setGalleryHtmlDraft,
    onGalleryGeminiFromHtml,
    price,
    setPrice,
    currency,
    setCurrency,
    formUsdToRubTotal,
    peopleCount,
    rating,
    setRating,
    freeCancellation,
    setFreeCancellation,
    amenitiesInput,
    setAmenitiesInput,
    notes,
    setNotes,
    formatRubAmount,
  } = props;

  return (
    <div
      className={cn(
        "relative z-10 mx-auto my-6 max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-full max-w-3xl overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl",
        LV_MODAL_PANEL_ENTER_CLASS,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-medium">
          {editingId ? "Редактировать вариант" : "Добавить вариант"}
        </h2>
        <Button type="button" variant="outline" onClick={resetForm}>
          Закрыть
        </Button>
      </div>

      <form onSubmit={onCreate} className="mt-4 grid gap-3 md:grid-cols-2">
        <AccommodationFormSourceFields
          title={title}
          setTitle={setTitle}
          provider={provider}
          setProvider={setProvider}
          pricingMode={pricingMode}
          setPricingMode={setPricingMode}
          sourceUrl={sourceUrl}
          setSourceUrl={setSourceUrl}
          previewBusy={previewBusy}
          geminiBusy={geminiBusy}
          onFetchPreview={onFetchPreview}
          onGeminiEnrich={onGeminiEnrich}
          geminiHtmlDraft={geminiHtmlDraft}
          setGeminiHtmlDraft={setGeminiHtmlDraft}
          onGeminiEnrichFromHtml={onGeminiEnrichFromHtml}
          locationLabel={locationLabel}
          setLocationLabel={setLocationLabel}
          setGeocodeResults={setGeocodeResults}
          geocodeBusy={geocodeBusy}
          onGeocodeSearch={onGeocodeSearch}
          geocodeResults={geocodeResults}
          setSelectedCoords={setSelectedCoords}
          latInput={latInput}
          setLatInput={setLatInput}
          lngInput={lngInput}
          setLngInput={setLngInput}
          selectedCoords={selectedCoords}
          mapCenter={mapCenter}
          previewDescription={previewDescription}
          setPreviewDescription={setPreviewDescription}
        />
        <AccommodationFormGalleryFields
          previewImages={previewImages}
          setPreviewImages={setPreviewImages}
          uploadBusy={uploadBusy}
          galleryGeminiBusy={galleryGeminiBusy}
          onUploadImages={onUploadImages}
          manualImageUrlDraft={manualImageUrlDraft}
          setManualImageUrlDraft={setManualImageUrlDraft}
          manualImageZoneDraft={manualImageZoneDraft}
          setManualImageZoneDraft={setManualImageZoneDraft}
          addPreviewImageFromUrl={addPreviewImageFromUrl}
          galleryHtmlDraft={galleryHtmlDraft}
          setGalleryHtmlDraft={setGalleryHtmlDraft}
          geminiBusy={geminiBusy}
          onGalleryGeminiFromHtml={onGalleryGeminiFromHtml}
        />
        <AccommodationFormPricingFields
          price={price}
          setPrice={setPrice}
          currency={currency}
          setCurrency={setCurrency}
          formUsdToRubTotal={formUsdToRubTotal}
          peopleCount={peopleCount}
          formatRubAmount={formatRubAmount}
          rating={rating}
          setRating={setRating}
          freeCancellation={freeCancellation}
          setFreeCancellation={setFreeCancellation}
          amenitiesInput={amenitiesInput}
          setAmenitiesInput={setAmenitiesInput}
          notes={notes}
          setNotes={setNotes}
          editingId={editingId}
          resetForm={resetForm}
        />
      </form>
    </div>
  );
}
