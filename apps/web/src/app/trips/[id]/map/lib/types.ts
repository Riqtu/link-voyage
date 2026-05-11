import { getApiClient } from "@/lib/api-client";

export type TripPoint = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["tripPoint"]["list"]["query"]>
>[number];

export type GeocodeResult = Awaited<
  ReturnType<
    ReturnType<typeof getApiClient>["accommodation"]["geocodeByQuery"]["mutate"]
  >
>[number];
