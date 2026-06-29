"use client";

import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { viewerQtyOnLine } from "../lib/receipt-helpers";
import type { ReceiptDetail } from "../lib/types";
import { useReceiptDetailMutations } from "./use-receipt-detail-mutations";

export function useReceiptDetailPage() {
  const router = useRouter();
  const { id: tripId, receiptId } = useParams<{
    id: string;
    receiptId: string;
  }>();
  const [data, setData] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [uploadBusy, setUploadBusy] = useState(false);
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [savingLineItemId, setSavingLineItemId] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [reimbursedBusy, setReimbursedBusy] = useState(false);
  const [addParticipantBusy, setAddParticipantBusy] = useState(false);
  const [removeParticipantUserId, setRemoveParticipantUserId] = useState<
    string | null
  >(null);
  const [payerSaving, setPayerSaving] = useState(false);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [rubPerUnit, setRubPerUnit] = useState<number | null>(null);
  const [rubQuoteDate, setRubQuoteDate] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qtyCommitTimersRef = useRef<Partial<Record<string, number>>>({});

  const viewerCanManageReceipt = useMemo(
    () =>
      data
        ? data.viewerId === data.paidByUserId ||
          data.viewerId === data.createdByUserId
        : false,
    [data],
  );

  const viewerShare = useMemo(
    () =>
      data && data.viewerId in data.shareByMember
        ? data.shareByMember[data.viewerId]!
        : 0,
    [data],
  );

  const viewerMarkedLinesCount = useMemo(
    () =>
      data
        ? data.lineItems.filter((l) => viewerQtyOnLine(l, data.viewerId) > 1e-9)
            .length
        : 0,
    [data],
  );

  const receiptLinesTotal = data?.lineItems.length ?? 0;

  const currencyCode = data?.currency?.toUpperCase() ?? "RUB";
  const canConvertToRub = rubPerUnit !== null;
  const shouldShowRubInfo = currencyCode !== "RUB";

  const toRub = useCallback(
    (amount: number): number | null => {
      if (rubPerUnit !== null) return amount * rubPerUnit;
      return null;
    },
    [rubPerUnit],
  );

  const fetchReceipt = useCallback(async (): Promise<ReceiptDetail | null> => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return null;
    }
    const api = getApiClient();
    return await api.tripReceipt.byId.query({ receiptId });
  }, [receiptId, router]);

  const loadReceipt = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchReceipt();
      if (r) setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить чек");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [fetchReceipt]);

  const refreshReceipt = useCallback(async () => {
    setRefreshing(true);
    try {
      const r = await fetchReceipt();
      if (r) {
        setData(r);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось обновить чек");
    } finally {
      setRefreshing(false);
    }
  }, [fetchReceipt]);

  useEffect(() => {
    void loadReceipt();
  }, [loadReceipt]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    const api = getApiClient();
    const currency = (data.currency || "RUB").toUpperCase();
    setRubPerUnit(null);
    setRubQuoteDate(null);
    void api.forex.rubRate.query({ currency }).then((res) => {
      if (cancelled || !res.ok) return;
      setRubPerUnit(res.rubPerUnit);
      setRubQuoteDate(res.quoteDate);
    });
    return () => {
      cancelled = true;
    };
    // Курс только при смене валюты, не при каждом изменении всего объекта receipt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.currency]);

  useEffect(() => {
    const pending = qtyCommitTimersRef.current;
    return () => {
      for (const tid of Object.values(pending)) {
        if (tid !== undefined) clearTimeout(tid);
      }
    };
  }, []);

  useEffect(() => {
    setPhotoModalOpen(false);
  }, [receiptId]);

  useEffect(() => {
    if (!data?.imageUrl && photoModalOpen) setPhotoModalOpen(false);
  }, [data?.imageUrl, photoModalOpen]);

  const closePhotoModal = useCallback(() => setPhotoModalOpen(false), []);

  const mutations = useReceiptDetailMutations({
    tripId,
    receiptId,
    router,
    data,
    setData,
    setError,
    setUploadBusy,
    setAnalyzeBusy,
    setSavingLineItemId,
    setRemoveBusy,
    setReimbursedBusy,
    setAddParticipantBusy,
    setRemoveParticipantUserId,
    setPayerSaving,
    viewerCanManageReceipt,
    refreshReceipt,
  });

  return {
    tripId,
    receiptId,
    data,
    error,
    loading,
    refreshing,
    uploadBusy,
    analyzeBusy,
    savingLineItemId,
    removeBusy,
    reimbursedBusy,
    addParticipantBusy,
    removeParticipantUserId,
    payerSaving,
    photoModalOpen,
    setPhotoModalOpen,
    closePhotoModal,
    rubQuoteDate,
    fileRef,
    qtyCommitTimersRef,
    viewerCanManageReceipt,
    viewerShare,
    viewerMarkedLinesCount,
    receiptLinesTotal,
    currencyCode,
    canConvertToRub,
    shouldShowRubInfo,
    toRub,
    ...mutations,
  };
}
