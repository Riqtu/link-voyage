"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import {
  patchConsumptionOptimistic,
  patchReimbursedOptimistic,
} from "@/lib/receipt-shares-preview";
import { cn } from "@/lib/utils";
import { Check, ChevronLeft, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";

type ReceiptDetail = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["tripReceipt"]["byId"]["query"]>
>;

function formatMoney(n: number, currency: string): string {
  return `${n.toLocaleString("ru-RU", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

/** Сохранить порции на сервер через столько мс после последнего набора в поле */
const QTY_COMMIT_DEBOUNCE_MS = 480;

/** Одна единица в чеке — достаточно да/нет вместо поля количества */
function isSingleQuantityLine(qty: number): boolean {
  return Number.isFinite(qty) && qty > 0 && Math.abs(qty - 1) < 1e-3;
}

function cloneReceipt(d: ReceiptDetail): ReceiptDetail {
  return {
    ...d,
    lineItems: d.lineItems.map((l) => ({
      ...l,
      participantUserIds: [...l.participantUserIds],
      consumptions: l.consumptions.map((c) => ({ ...c })),
    })),
    reimbursedPayerUserIds: [...d.reimbursedPayerUserIds],
  };
}

export default function ReceiptDetailPage() {
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
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const qtyCommitTimersRef = useRef<
    Partial<Record<string, ReturnType<typeof setTimeout>>>
  >({});

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

  /** Повторный запрос без скрытия экрана (после правок строк, фото, разбора) */
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
    const pending = qtyCommitTimersRef.current;
    return () => {
      for (const tid of Object.values(pending)) {
        if (tid) clearTimeout(tid);
      }
    };
  }, []);

  useEffect(() => {
    setPhotoModalOpen(false);
  }, [receiptId]);

  useEffect(() => {
    if (!photoModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotoModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [photoModalOpen]);

  useEffect(() => {
    if (!data?.imageUrl && photoModalOpen) setPhotoModalOpen(false);
  }, [data?.imageUrl, photoModalOpen]);

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

  function viewerQtyOnLine(
    line: ReceiptDetail["lineItems"][number],
    viewerId: string,
  ): number {
    const c = line.consumptions.find((x) => x.userId === viewerId);
    return c ? c.qty : 0;
  }

  async function commitLineConsumption(
    lineItemId: string,
    lineQty: number,
    raw: string,
    viewerId: string,
  ) {
    if (!data) return;

    let n = Number.parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n > lineQty) n = lineQty;
    n = Math.round(n * 1e6) / 1e6;

    const line = data.lineItems.find((l) => l.id === lineItemId);
    const prev = line ? viewerQtyOnLine(line, viewerId) : 0;
    if (Math.abs(n - prev) < 1e-9) return;

    const before = cloneReceipt(data);
    setData(patchConsumptionOptimistic(data, lineItemId, viewerId, n));
    setSavingLineItemId(lineItemId);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.setLineConsumption.mutate({
        receiptId,
        lineItemId,
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
  ) {
    if (!data) return;

    const line = data.lineItems.find((l) => l.id === lineItemId);
    const prev = line ? viewerQtyOnLine(line, viewerId) : 0;
    const next = prev > 1e-9 ? 0 : Math.min(1, Math.max(0, lineQty));

    const before = cloneReceipt(data);
    setData(patchConsumptionOptimistic(data, lineItemId, viewerId, next));
    setSavingLineItemId(lineItemId);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.setLineConsumption.mutate({
        receiptId,
        lineItemId,
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

  async function toggleReimbursed() {
    if (!data) return;
    const before = cloneReceipt(data);
    setData(patchReimbursedOptimistic(data, data.viewerId));
    setReimbursedBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.toggleReimbursedPayer.mutate({ receiptId });
      await refreshReceipt();
    } catch (e) {
      setData(before);
      setError(e instanceof Error ? e.message : "Не удалось сохранить отметку");
    } finally {
      setReimbursedBusy(false);
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

  const viewerShare =
    data && data.viewerId in data.shareByMember
      ? data.shareByMember[data.viewerId]!
      : 0;

  const viewerMarkedLinesCount = data
    ? data.lineItems.filter((l) => viewerQtyOnLine(l, data.viewerId) > 1e-9)
        .length
    : 0;
  const receiptLinesTotal = data?.lineItems.length ?? 0;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href={`/trips/${tripId}/receipts`}
          className={cn(
            buttonVariants({ variant: "ghost", size: "sm" }),
            "gap-1 text-muted-foreground",
          )}
        >
          <ChevronLeft className="size-4" aria-hidden />К списку чеков
        </Link>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="destructive"
            size="sm"
            type="button"
            disabled={removeBusy || loading}
            onClick={() => void removeReceipt()}
          >
            Удалить чек
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {refreshing && data ? (
        <p className="mb-3 text-xs text-muted-foreground" aria-live="polite">
          Обновляем данные…
        </p>
      ) : null}

      {loading && !data ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : data ? (
        <>
          <header className="rounded-2xl border bg-card p-6 shadow-sm">
            <h1 className="text-2xl font-semibold tracking-tight">
              {data.title}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Оплатил:{" "}
              <strong className="text-foreground">{data.paidByUserName}</strong>
              {data.description ? (
                <>
                  <br />
                  {data.description}
                </>
              ) : null}
            </p>
          </header>

          <section className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-semibold">Фото чека</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Загрузите чёткий снимок. Для распознавания нужны{" "}
              <strong className="text-foreground">GEMINI_API_KEY</strong> и
              поддержка Gemini на бэкенде.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                disabled={uploadBusy}
                onClick={() => fileRef.current?.click()}
              >
                {uploadBusy
                  ? "Загрузка…"
                  : data.imageUrl
                    ? "Заменить фото"
                    : "Выбрать фото"}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={(e) => void onPickPhoto(e)}
              />
              <Button
                type="button"
                disabled={analyzeBusy || !data.imageUrl}
                onClick={() => void runAnalyze()}
              >
                <Sparkles className="size-4 sm:mr-1" aria-hidden />
                {analyzeBusy ? "Разбираем…" : "Разобрать с Gemini"}
              </Button>
            </div>
            {data.imageUrl ? (
              <button
                type="button"
                className="group mt-4 block w-fit max-w-full rounded-lg border bg-muted text-left outline-none ring-offset-background transition hover:opacity-95 focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setPhotoModalOpen(true)}
                aria-haspopup="dialog"
                aria-expanded={photoModalOpen}
                title="Открыть в полном размере"
              >
                <img
                  src={data.imageUrl}
                  alt="Чек — нажмите для просмотра"
                  className="max-h-80 w-auto max-w-full rounded-[inherit] object-contain"
                />
                <span className="sr-only">Открыть фото чека крупно</span>
              </button>
            ) : null}
          </section>

          <section className="mt-8 rounded-2xl border bg-card p-6 shadow-sm">
            <h2 className="text-sm font-semibold">Позиции и ваш выбор</h2>
            <p className="mt-1 max-w-[50rem] text-xs text-muted-foreground">
              Если в позиции количество 1 — галочка «участвую». Иначе укажите
              порции: сумма строки делится как (ваши порции / количество в
              чеке). Число в поле уходит на сервер примерно через{" "}
              <strong className="text-foreground font-medium">
                {(QTY_COMMIT_DEBOUNCE_MS / 1000).toLocaleString("ru-RU", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}{" "}
                с
              </strong>{" "}
              после последнего ввода или сразу по{" "}
              <strong className="text-foreground font-medium">Enter</strong> /
              клику вне поля. После отправки суммы пересчитываются на экране
              сразу (до ответа сервера), затем сверяются с ним — при ошибке сети
              может быть откат.
            </p>

            {data.lineItems.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                Позиций пока нет — загрузите фото и нажмите «Разобрать с
                Gemini».
              </p>
            ) : (
              <>
                <div className="mt-6 overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[36rem] text-left text-sm">
                    <thead className="border-b bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 font-medium">Позиция</th>
                        <th className="px-3 py-2 font-medium">Кол-во</th>
                        <th className="px-3 py-2 font-medium">Цена ×1</th>
                        <th className="px-3 py-2 font-medium">Сумма строки</th>
                        <th className="px-3 py-2 font-medium">
                          Порции / участие
                        </th>
                        <th className="hidden px-3 py-2 font-medium md:table-cell">
                          Кто сколько
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.lineItems.map((line) => {
                        const denom = line.consumedQtyTotal;
                        const rowQty =
                          typeof line.qty === "number" && line.qty > 0
                            ? line.qty
                            : null;
                        const viewerQty = viewerQtyOnLine(line, data.viewerId);
                        const viewerShareApprox =
                          rowQty !== null && viewerQty > 1e-9
                            ? (line.lineTotal * viewerQty) / rowQty
                            : null;

                        const entryCount =
                          denom > 1e-9 ? line.consumptions.length : 0;

                        return (
                          <tr
                            key={line.id}
                            className={cn(
                              "border-b border-border transition-colors",
                              savingLineItemId === line.id && "bg-muted/50",
                            )}
                          >
                            <td className="px-3 py-2 align-top font-medium">
                              {line.name}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div>{line.qty}</div>
                              {denom > 1e-9 ? (
                                <div className="mt-0.5 text-xs text-muted-foreground">
                                  набрано{" "}
                                  <span className="tabular-nums text-foreground">
                                    {line.consumedQtyTotal}
                                  </span>{" "}
                                  из {line.qty}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {line.unitPrice !== undefined
                                ? formatMoney(line.unitPrice, data.currency)
                                : "—"}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {formatMoney(line.lineTotal, data.currency)}
                              {viewerShareApprox !== null ? (
                                <div className="text-xs text-muted-foreground">
                                  вам ≈{" "}
                                  {formatMoney(
                                    viewerShareApprox,
                                    data.currency,
                                  )}
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 align-middle">
                              {isSingleQuantityLine(line.qty) ? (
                                <label
                                  className={cn(
                                    "flex cursor-pointer items-center gap-2",
                                    savingLineItemId === line.id &&
                                      "cursor-wait opacity-90",
                                  )}
                                >
                                  <input
                                    type="checkbox"
                                    className="size-4 rounded border"
                                    checked={viewerQty > 1e-9}
                                    disabled={savingLineItemId === line.id}
                                    aria-busy={
                                      savingLineItemId === line.id
                                        ? true
                                        : undefined
                                    }
                                    aria-label={`Участвую в «${line.name}»`}
                                    onChange={() =>
                                      void toggleSinglePortion(
                                        line.id,
                                        line.qty,
                                        data.viewerId,
                                      )
                                    }
                                  />
                                  {savingLineItemId === line.id ? (
                                    <Loader2
                                      className="size-4 shrink-0 animate-spin text-muted-foreground"
                                      aria-hidden
                                    />
                                  ) : null}
                                  <span className="text-xs text-muted-foreground">
                                    участвую
                                  </span>
                                </label>
                              ) : (
                                <div className="flex max-w-[8rem] flex-col gap-1">
                                  <input
                                    type="number"
                                    inputMode="decimal"
                                    min={0}
                                    max={line.qty}
                                    step={
                                      Number.isInteger(line.qty) ? 1 : "any"
                                    }
                                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm tabular-nums"
                                    defaultValue={
                                      viewerQty > 0 ? String(viewerQty) : ""
                                    }
                                    key={`${line.id}-${viewerQty}-${line.consumedQtyTotal}`}
                                    disabled={savingLineItemId === line.id}
                                    aria-busy={
                                      savingLineItemId === line.id
                                        ? true
                                        : undefined
                                    }
                                    aria-label={`Сколько порций «${line.name}» для вас`}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      const pending =
                                        qtyCommitTimersRef.current[line.id];
                                      if (pending) clearTimeout(pending);
                                      qtyCommitTimersRef.current[line.id] =
                                        setTimeout(() => {
                                          delete qtyCommitTimersRef.current[
                                            line.id
                                          ];
                                          void commitLineConsumption(
                                            line.id,
                                            line.qty,
                                            raw,
                                            data.viewerId,
                                          );
                                        }, QTY_COMMIT_DEBOUNCE_MS);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key !== "Enter") return;
                                      e.preventDefault();
                                      e.currentTarget.blur();
                                    }}
                                    onBlur={(e) => {
                                      const pending =
                                        qtyCommitTimersRef.current[line.id];
                                      if (pending) {
                                        clearTimeout(pending);
                                        delete qtyCommitTimersRef.current[
                                          line.id
                                        ];
                                      }
                                      void commitLineConsumption(
                                        line.id,
                                        line.qty,
                                        e.target.value,
                                        data.viewerId,
                                      );
                                    }}
                                  />
                                  <span className="flex items-center gap-1 text-[0.65rem] text-muted-foreground">
                                    {savingLineItemId === line.id ? (
                                      <Loader2
                                        className="size-3 shrink-0 animate-spin"
                                        aria-hidden
                                      />
                                    ) : null}
                                    макс. {line.qty}
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="hidden px-3 py-2 align-top text-xs md:table-cell">
                              {entryCount === 0 ? (
                                <span className="text-muted-foreground">
                                  никто не указал
                                </span>
                              ) : (
                                <ul className="space-y-0.5">
                                  {line.consumptions.map((c) => (
                                    <li key={c.userId}>
                                      {data.members.find(
                                        (m) => m.userId === c.userId,
                                      )?.name ?? c.userId.slice(0, 6)}
                                      :{" "}
                                      <span className="tabular-nums font-medium">
                                        {c.qty}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 ml-auto max-w-md text-right text-xs leading-relaxed text-muted-foreground">
                  Итого по чеку:{" "}
                  <strong className="text-foreground">
                    {formatMoney(data.totalAmount, data.currency)}
                  </strong>
                  <br />
                  Ваша сумма по строкам с долями:{" "}
                  <strong className="text-primary">
                    {formatMoney(viewerShare, data.currency)}
                  </strong>
                  <br />
                  Строк выбрано у вас:{" "}
                  <strong className="tabular-nums text-foreground">
                    {viewerMarkedLinesCount} из {receiptLinesTotal}
                  </strong>
                  {!data.anyLineSelections &&
                  data.hypotheticalShareAllEqual !== null ? (
                    <>
                      <br />
                      <span className="mt-2 inline-block max-w-sm text-[0.72rem]">
                        Пока никто ни в строке не отмечен. Если делить{" "}
                        <strong className="text-foreground">
                          весь чек поровну
                        </strong>{" "}
                        на всех {data.members.length}:{" "}
                        {formatMoney(
                          data.hypotheticalShareAllEqual,
                          data.currency,
                        )}{" "}
                        на человека.
                      </span>
                    </>
                  ) : null}
                </div>
              </>
            )}

            <div className="mt-8 rounded-xl border bg-muted/30 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  По участникам (только строки с указанными долями)
                </h3>
                {data.viewerId !== data.paidByUserId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={
                      reimbursedBusy || refreshing || Boolean(savingLineItemId)
                    }
                    className={
                      data.reimbursedPayerUserIds.includes(data.viewerId)
                        ? "border-emerald-600/40 bg-emerald-600/10"
                        : ""
                    }
                    onClick={() => void toggleReimbursed()}
                  >
                    {reimbursedBusy ? (
                      <Loader2
                        className="size-3.5 shrink-0 animate-spin"
                        aria-hidden
                      />
                    ) : null}
                    {data.reimbursedPayerUserIds.includes(data.viewerId)
                      ? "Снять «скинул(а)»"
                      : "Я скинул(а)"}
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 max-w-xl text-[0.7rem] text-muted-foreground">
                Отметка только для вашей учётки — что перевели оплатившему чек.
                На расчёт долей по позициям не влияет.
              </p>
              <div className="mt-3 hidden grid-cols-[minmax(0,1fr)_7rem_auto] gap-3 border-b pb-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground sm:grid">
                <span>Участник</span>
                <span className="text-right">Перевод</span>
                <span className="text-right">Доля</span>
              </div>
              <ul className="mt-2 grid gap-1 text-sm">
                {data.members.map((m) => {
                  const isPayer = m.userId === data.paidByUserId;
                  const reimbursed = data.reimbursedPayerUserIds.includes(
                    m.userId,
                  );
                  return (
                    <li
                      key={m.userId}
                      className="grid grid-cols-1 gap-2 border-border border-t py-2 first:border-t-0 first:pt-0 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-center sm:gap-3"
                    >
                      <span className="font-medium">
                        {m.name}
                        {isPayer ? (
                          <span className="ml-1.5 font-normal text-muted-foreground text-xs">
                            (оплатил чек)
                          </span>
                        ) : null}
                      </span>
                      <span className="text-right text-xs sm:order-none">
                        {isPayer ? (
                          <span className="text-muted-foreground">—</span>
                        ) : reimbursed ? (
                          <span className="inline-flex items-center justify-end gap-1 font-medium text-emerald-700 dark:text-emerald-500">
                            <Check className="size-3.5 shrink-0" aria-hidden />
                            скинул(а)
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </span>
                      <span className="text-right font-medium tabular-nums">
                        {formatMoney(
                          data.shareByMember[m.userId] ?? 0,
                          data.currency,
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </section>
        </>
      ) : !loading ? (
        <p className="text-sm text-muted-foreground">Чек не загружен.</p>
      ) : null}

      {photoModalOpen && data?.imageUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Фото чека"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 pt-16"
          onClick={() => setPhotoModalOpen(false)}
        >
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute top-3 right-3 z-[1] shadow-md"
            aria-label="Закрыть"
            onClick={(e) => {
              e.stopPropagation();
              setPhotoModalOpen(false);
            }}
          >
            <X className="size-4" aria-hidden />
          </Button>
          <img
            src={data.imageUrl}
            alt="Чек крупно"
            className="max-h-[calc(100vh-5rem)] max-w-full object-contain shadow-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </main>
  );
}
