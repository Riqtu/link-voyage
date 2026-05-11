"use client";

import { Button } from "@/components/ui/button";
import { AccommodationMap } from "../map";
import type { AccommodationFormModalPanelProps } from "./types";

export type AccommodationFormSourceFieldsProps = Pick<
  AccommodationFormModalPanelProps,
  | "title"
  | "setTitle"
  | "provider"
  | "setProvider"
  | "pricingMode"
  | "setPricingMode"
  | "sourceUrl"
  | "setSourceUrl"
  | "previewBusy"
  | "geminiBusy"
  | "onFetchPreview"
  | "onGeminiEnrich"
  | "geminiHtmlDraft"
  | "setGeminiHtmlDraft"
  | "onGeminiEnrichFromHtml"
  | "locationLabel"
  | "setLocationLabel"
  | "setGeocodeResults"
  | "geocodeBusy"
  | "onGeocodeSearch"
  | "geocodeResults"
  | "setSelectedCoords"
  | "latInput"
  | "setLatInput"
  | "lngInput"
  | "setLngInput"
  | "selectedCoords"
  | "mapCenter"
  | "previewDescription"
  | "setPreviewDescription"
>;

export function AccommodationFormSourceFields({
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
}: AccommodationFormSourceFieldsProps) {
  return (
    <>
      <input
        className="rounded-lg border bg-background px-3 py-2 text-sm"
        placeholder="Название жилья"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <input
        className="rounded-lg border bg-background px-3 py-2 text-sm"
        placeholder="Провайдер (Booking/Airbnb...)"
        value={provider}
        onChange={(e) => setProvider(e.target.value)}
      />
      <select
        className="rounded-lg border bg-background px-3 py-2 text-sm"
        value={pricingMode}
        onChange={(e) =>
          setPricingMode(e.target.value as "total" | "perNight" | "perPerson")
        }
      >
        <option value="total">Цена за весь период</option>
        <option value="perNight">Цена за ночь</option>
        <option value="perPerson">Цена за человека</option>
      </select>
      <div className="flex flex-wrap gap-2 md:col-span-2">
        <input
          className="min-w-0 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"
          placeholder="Ссылка на объявление"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          disabled={previewBusy || geminiBusy}
          onClick={() => void onFetchPreview()}
        >
          {previewBusy ? "Загрузка..." : "Заполнить по ссылке"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={geminiBusy || previewBusy}
          onClick={() => void onGeminiEnrich()}
          title="Использует Gemini: разбор метаданных страницы и структурирование полей (нужен GEMINI_API_KEY на сервере)"
        >
          {geminiBusy ? "Gemini…" : "Через Gemini"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground md:col-span-2">
        «Заполнить по ссылке» — только превью с страницы. «Через Gemini» — то же
        превью плюс ИИ заполняет цену, удобства, рейтинг и др.
      </p>
      <div className="md:col-span-2 space-y-2 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/15 p-3">
        <p className="text-xs text-muted-foreground">
          Если сайт не отдаёт страницу серверу (редирект на вход): вставьте HTML
          из DevTools. В поле «Ссылка» лучше указать URL той же вкладки — так
          разрешатся относительные картинки; иначе берётся технический базовый
          хост trip.com.
        </p>
        <textarea
          className="min-h-[140px] w-full resize-y rounded-lg border bg-background px-3 py-2 font-mono text-xs leading-relaxed"
          placeholder="Вставьте фрагмент или outerHTML узла…"
          value={geminiHtmlDraft}
          onChange={(e) => setGeminiHtmlDraft(e.target.value)}
          disabled={geminiBusy}
          spellCheck={false}
          autoComplete="off"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={previewBusy || geminiBusy}
          onClick={() => void onGeminiEnrichFromHtml()}
        >
          {geminiBusy ? "Gemini…" : "Заполнить из HTML (Gemini)"}
        </Button>
      </div>
      <input
        className="rounded-lg border bg-background px-3 py-2 text-sm md:col-span-2"
        placeholder="Локация (например: центр, рядом с метро)"
        value={locationLabel}
        onChange={(e) => {
          setLocationLabel(e.target.value);
          setGeocodeResults([]);
        }}
      />
      <div className="flex gap-2 md:col-span-2">
        <Button
          type="button"
          variant="outline"
          disabled={geocodeBusy}
          onClick={() => void onGeocodeSearch()}
        >
          {geocodeBusy ? "Ищем координаты..." : "Найти координаты"}
        </Button>
      </div>
      {geocodeResults.length > 0 ? (
        <div className="md:col-span-2 space-y-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">
            Выберите подходящий вариант:
          </p>
          <div className="space-y-2">
            {geocodeResults.map((result, index) => (
              <button
                key={`${result.lat}-${result.lng}-${index}`}
                type="button"
                className="w-full rounded-lg border bg-background px-3 py-2 text-left text-xs hover:bg-muted"
                onClick={() => {
                  setSelectedCoords({
                    lat: result.lat,
                    lng: result.lng,
                  });
                  setLatInput(result.lat.toFixed(6));
                  setLngInput(result.lng.toFixed(6));
                  setLocationLabel(result.label);
                }}
              >
                <span className="block">{result.label}</span>
                <span className="text-muted-foreground">
                  {result.lat.toFixed(5)}, {result.lng.toFixed(5)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="md:col-span-2">
        <p className="mb-2 text-sm font-medium">Точка на карте</p>
        <div className="h-[260px] overflow-hidden rounded-xl border">
          <AccommodationMap
            center={
              selectedCoords
                ? { lat: selectedCoords.lat, lng: selectedCoords.lng }
                : mapCenter
            }
            points={[]}
            selected={selectedCoords}
            onSelect={(lat, lng) => {
              setSelectedCoords({ lat, lng });
              setLatInput(lat.toFixed(6));
              setLngInput(lng.toFixed(6));
            }}
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Координаты:{" "}
          {selectedCoords
            ? `${selectedCoords.lat.toFixed(5)}, ${selectedCoords.lng.toFixed(5)}`
            : "не выбраны"}
        </p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            className="rounded-lg border bg-background px-3 py-2 text-sm"
            placeholder="Широта (lat), например 55.751244"
            value={latInput}
            onChange={(e) => {
              const next = e.target.value;
              setLatInput(next);
              const lat = Number(next);
              const lng = Number(lngInput);
              if (
                Number.isFinite(lat) &&
                Number.isFinite(lng) &&
                lat >= -90 &&
                lat <= 90 &&
                lng >= -180 &&
                lng <= 180
              ) {
                setSelectedCoords({ lat, lng });
              }
            }}
          />
          <input
            className="rounded-lg border bg-background px-3 py-2 text-sm"
            placeholder="Долгота (lng), например 37.618423"
            value={lngInput}
            onChange={(e) => {
              const next = e.target.value;
              setLngInput(next);
              const lat = Number(latInput);
              const lng = Number(next);
              if (
                Number.isFinite(lat) &&
                Number.isFinite(lng) &&
                lat >= -90 &&
                lat <= 90 &&
                lng >= -180 &&
                lng <= 180
              ) {
                setSelectedCoords({ lat, lng });
              }
            }}
          />
        </div>
      </div>
      <textarea
        className="rounded-lg border bg-background px-3 py-2 text-sm md:col-span-2"
        placeholder="Описание с страницы (можно править перед сохранением)"
        rows={4}
        value={previewDescription}
        onChange={(e) => setPreviewDescription(e.target.value)}
      />
    </>
  );
}
