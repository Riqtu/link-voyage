import type { ApiClient } from "@/lib/trpc";

export type Option = Awaited<
  ReturnType<ApiClient["accommodation"]["list"]["query"]>
>[number];

export type GeocodeResult = Awaited<
  ReturnType<ApiClient["accommodation"]["geocodeByQuery"]["mutate"]>
>[number];

export type GeminiEnrichmentPayload = Awaited<
  ReturnType<ApiClient["accommodation"]["enrichFromGeminiUrl"]["mutate"]>
>;

/** Строка комментария в UI (соответствует элементу массива в `commentsForTrip`). */
export type AccommodationCommentRow = Awaited<
  ReturnType<ApiClient["accommodation"]["commentsForTrip"]["query"]>
>[string][number];

export type ModalCurrency = "USD" | "EUR" | "RUB";
