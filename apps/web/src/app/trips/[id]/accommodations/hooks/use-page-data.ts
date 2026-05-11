import { getApiClient } from "@/lib/api-client";
import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { AccommodationCommentRow, Option } from "../lib/types";

type UseAccommodationsPageDataArgs = {
  tripId: string;
  setError: Dispatch<SetStateAction<string | null>>;
};

export function useAccommodationsPageData({
  tripId,
  setError,
}: UseAccommodationsPageDataArgs) {
  const [options, setOptions] = useState<Option[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [peopleCount, setPeopleCount] = useState(4);
  const [tripStartDate, setTripStartDate] = useState<string | null>(null);
  const [tripEndDate, setTripEndDate] = useState<string | null>(null);
  const [tripRequirements, setTripRequirements] = useState<string[]>([]);
  const [rubPerUsd, setRubPerUsd] = useState<number | null>(null);
  const [cbrUsdRubQuoteDate, setCbrUsdRubQuoteDate] = useState<string | null>(
    null,
  );
  const [commentsByOption, setCommentsByOption] = useState<
    Record<string, AccommodationCommentRow[]>
  >({});
  const [canCollaborate, setCanCollaborate] = useState(false);

  const loadAccommodationsPageContext = useCallback(async () => {
    try {
      const api = getApiClient();
      const ctx = await api.trip.forAccommodationsPage.query({
        tripId,
      });
      setCanCollaborate(ctx.canCollaborate);
      setPeopleCount(ctx.peopleCount);
      setTripStartDate(ctx.startDate);
      setTripEndDate(ctx.endDate);
      setTripRequirements(ctx.housingRequirements);
    } catch {
      setCanCollaborate(false);
    }
  }, [tripId]);

  const loadCbrUsdRubRate = useCallback(async () => {
    try {
      const api = getApiClient();
      const r = await api.forex.usdRubRate.query();
      if (r.ok) {
        setRubPerUsd(r.rubPerUsd);
        setCbrUsdRubQuoteDate(r.quoteDate);
      } else {
        setRubPerUsd(null);
        setCbrUsdRubQuoteDate(null);
      }
    } catch {
      setRubPerUsd(null);
      setCbrUsdRubQuoteDate(null);
    }
  }, []);

  const reloadAccommodationComments = useCallback(async () => {
    try {
      const api = getApiClient();
      const data = await api.accommodation.commentsForTrip.query({
        tripId,
      });
      setCommentsByOption(data);
    } catch {
      setCommentsByOption({});
    }
  }, [tripId]);

  const loadOptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const result = await api.accommodation.list.query({
        tripId,
      });
      setOptions(result);
      await reloadAccommodationComments();
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось загрузить жилье",
      );
    } finally {
      setIsLoading(false);
    }
  }, [tripId, reloadAccommodationComments, setError]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccommodationsPageContext();
      void loadOptions();
      void loadCbrUsdRubRate();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAccommodationsPageContext, loadOptions, loadCbrUsdRubRate]);

  useEffect(() => {
    function onPageShow(ev: PageTransitionEvent) {
      if (ev.persisted) void loadAccommodationsPageContext();
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void loadAccommodationsPageContext();
      }
    }
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [loadAccommodationsPageContext]);

  return {
    options,
    isLoading,
    peopleCount,
    tripStartDate,
    tripEndDate,
    tripRequirements,
    rubPerUsd,
    cbrUsdRubQuoteDate,
    commentsByOption,
    canCollaborate,
    loadOptions,
    reloadAccommodationComments,
  };
}
