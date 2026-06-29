"use client";

import { getApiClient } from "@/lib/api-client";
import {
  patchConsumptionOptimistic,
  patchReimbursedOptimistic,
} from "@/lib/receipt-shares-preview";
import { useRouter } from "next/navigation";
import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import { cloneReceipt, viewerQtyOnLine } from "../lib/receipt-helpers";
import type { ReceiptDetail } from "../lib/types";

export type ReceiptDetailMutationsDeps = {
  tripId: string;
  receiptId: string;
  router: ReturnType<typeof useRouter>;
  data: ReceiptDetail | null;
  setData: Dispatch<SetStateAction<ReceiptDetail | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setUploadBusy: Dispatch<SetStateAction<boolean>>;
  setAnalyzeBusy: Dispatch<SetStateAction<boolean>>;
  setSavingLineItemId: Dispatch<SetStateAction<string | null>>;
  setRemoveBusy: Dispatch<SetStateAction<boolean>>;
  setReimbursedBusy: Dispatch<SetStateAction<boolean>>;
  setAddParticipantBusy: Dispatch<SetStateAction<boolean>>;
  setRemoveParticipantUserId: Dispatch<SetStateAction<string | null>>;
  setPayerSaving: Dispatch<SetStateAction<boolean>>;
  viewerCanManageReceipt: boolean;
  refreshReceipt: () => Promise<void>;
};

export function useReceiptDetailMutations(p: ReceiptDetailMutationsDeps) {
  const {
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
  } = p;

  async function onPickPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file?.size || !tripId || !data) return;
    setUploadBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      const ct = file.type || "image/jpeg";
      const signed = await api.s3.getSignedReceiptImageUploadUrl.mutate({
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

      await api.tripReceipt.setImageUrl.mutate({
        receiptId,
        imageUrl: signed.publicUrl,
      });
      await refreshReceipt();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить фото");
    } finally {
      setUploadBusy(false);
      if (event.target) event.target.value = "";
    }
  }

  async function runAnalyze() {
    setAnalyzeBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.analyzeWithGemini.mutate({ receiptId });
      await refreshReceipt();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось разобрать чек");
    } finally {
      setAnalyzeBusy(false);
    }
  }

  async function commitLineConsumption(
    lineItemId: string,
    lineQty: number,
    raw: string,
    viewerId: string,
    targetUserId?: string,
  ) {
    if (!data) return;

    let n = Number.parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > lineQty) n = lineQty;
    n = Math.round(n * 1e6) / 1e6;

    const uid = targetUserId ?? viewerId;
    const line = data.lineItems.find((l) => l.id === lineItemId);
    const prev = line ? viewerQtyOnLine(line, uid) : 0;
    if (Math.abs(n - prev) < 1e-9) return;

    const before = cloneReceipt(data);
    setData(patchConsumptionOptimistic(data, lineItemId, uid, n));
    setSavingLineItemId(lineItemId);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.setLineConsumption.mutate({
        receiptId,
        lineItemId,
        ...(uid !== viewerId ? { userId: uid } : {}),
        qty: n,
      });
      await refreshReceipt();
    } catch (e) {
      setData(before);
      setError(e instanceof Error ? e.message : "Не удалось обновить строку");
    } finally {
      setSavingLineItemId(null);
    }
  }

  async function toggleSinglePortion(
    lineItemId: string,
    lineQty: number,
    viewerId: string,
    targetUserId?: string,
  ) {
    if (!data) return;

    const uid = targetUserId ?? viewerId;
    const line = data.lineItems.find((l) => l.id === lineItemId);
    const prev = line ? viewerQtyOnLine(line, uid) : 0;
    const next = prev > 1e-9 ? 0 : Math.min(1, Math.max(0, lineQty));

    const before = cloneReceipt(data);
    setData(patchConsumptionOptimistic(data, lineItemId, uid, next));
    setSavingLineItemId(lineItemId);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.setLineConsumption.mutate({
        receiptId,
        lineItemId,
        ...(uid !== viewerId ? { userId: uid } : {}),
        qty: next,
      });
      await refreshReceipt();
    } catch (e) {
      setData(before);
      setError(e instanceof Error ? e.message : "Не удалось обновить строку");
    } finally {
      setSavingLineItemId(null);
    }
  }

  async function toggleReimbursed(targetUserId?: string) {
    if (!data) return;
    const uid = targetUserId ?? data.viewerId;
    const before = cloneReceipt(data);
    setData(patchReimbursedOptimistic(data, uid));
    setReimbursedBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.toggleReimbursedPayer.mutate({
        receiptId,
        ...(targetUserId ? { userId: targetUserId } : {}),
      });
      await refreshReceipt();
    } catch (e) {
      setData(before);
      setError(e instanceof Error ? e.message : "Не удалось сохранить отметку");
    } finally {
      setReimbursedBusy(false);
    }
  }

  async function addExternalParticipant() {
    if (!data || !viewerCanManageReceipt) return;
    const raw = window.prompt("Имя участника вне поездки");
    const name = (raw ?? "").trim();
    if (name.length < 2) return;
    setAddParticipantBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.addExternalParticipant.mutate({ receiptId, name });
      await refreshReceipt();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось добавить участника",
      );
    } finally {
      setAddParticipantBusy(false);
    }
  }

  async function removeExternalParticipant(userId: string) {
    if (!data || !viewerCanManageReceipt) return;
    const member = data.members.find((m) => m.userId === userId);
    const label = member?.name ?? "этого участника";
    if (!window.confirm(`Удалить ${label} из чека?`)) return;
    setRemoveParticipantUserId(userId);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.removeExternalParticipant.mutate({
        receiptId,
        userId,
      });
      await refreshReceipt();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить участника");
    } finally {
      setRemoveParticipantUserId(null);
    }
  }

  async function removeReceipt() {
    const label = data?.title ?? "";
    if (!window.confirm(`Удалить чек «${label}»?`)) return;
    setRemoveBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.delete.mutate({ receiptId });
      router.replace(`/trips/${tripId}/receipts`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить чек");
    } finally {
      setRemoveBusy(false);
    }
  }

  async function changePaidByUser(nextPaidByUserId: string) {
    if (!data || !viewerCanManageReceipt) return;
    if (!nextPaidByUserId || nextPaidByUserId === data.paidByUserId) return;
    setPayerSaving(true);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.update.mutate({
        receiptId,
        title: data.title,
        description: data.description,
        paidByUserId: nextPaidByUserId,
      });
      await refreshReceipt();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось обновить оплатившего",
      );
    } finally {
      setPayerSaving(false);
    }
  }

  return {
    onPickPhoto,
    runAnalyze,
    commitLineConsumption,
    toggleSinglePortion,
    toggleReimbursed,
    addExternalParticipant,
    removeExternalParticipant,
    removeReceipt,
    changePaidByUser,
  };
}
