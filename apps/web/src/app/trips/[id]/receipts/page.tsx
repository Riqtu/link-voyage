"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import { cn } from "@/lib/utils";
import { Dialog } from "@base-ui/react/dialog";
import { Receipt, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

type ReceiptRow = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["tripReceipt"]["list"]["query"]>
>[number];

type TripBrief = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["trip"]["byId"]["query"]>
>;

function formatMoney(n: number, currency: string): string {
  return `${n.toLocaleString("ru-RU", {
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} ${currency}`;
}

export default function TripReceiptsListPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<TripBrief | null>(null);
  const [list, setList] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [paidByUserId, setPaidByUserId] = useState("");
  const [createSaving, setCreateSaving] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const [t, receipts] = await Promise.all([
        api.trip.byId.query({ tripId: id }),
        api.tripReceipt.list.query({ tripId: id }),
      ]);
      setTrip(t);
      setList(receipts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function openCreateModal() {
    if (!trip?.members?.length) return;
    setPaidByUserId((prev) => prev || trip.members[0]!.userId);
    setTitle("");
    setDescription("");
    setCreateOpen(true);
  }

  function handleCreateModalChange(open: boolean) {
    setCreateOpen(open);
    if (
      open &&
      trip?.members?.length &&
      !paidByUserId &&
      trip.members[0]?.userId
    ) {
      setPaidByUserId(trip.members[0].userId);
    }
  }

  async function onSubmitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setError("Название: минимум 2 символа");
      return;
    }
    if (!paidByUserId) {
      setError("Выберите, кто оплатил");
      return;
    }
    setCreateSaving(true);
    setError(null);
    try {
      const api = getApiClient();
      const res = await api.tripReceipt.create.mutate({
        tripId: id,
        title: trimmedTitle,
        description: description.trim() || undefined,
        paidByUserId,
      });
      setCreateOpen(false);
      router.push(`/trips/${id}/receipts/${res.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось создать чек");
    } finally {
      setCreateSaving(false);
    }
  }

  async function removeReceipt(receiptId: string, label: string) {
    const ok = window.confirm(`Удалить чек «${label}»?`);
    if (!ok) return;
    setDeletingId(receiptId);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripReceipt.delete.mutate({ receiptId });
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось удалить чек");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Чеки</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/trips/${id}`}
            className={cn(
              buttonVariants({ variant: "outline" }),
              "justify-center",
            )}
          >
            К поездке
          </Link>
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <section className="mb-8 rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-lg border bg-muted/50 p-2">
              <Receipt className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-medium">Разделите чеки за еду</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Загрузите фото чека, Gemini распознает позиции. Отметьте, что
                ели вы — сумма строк делится между отмеченными участниками.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 self-start sm:self-center"
            disabled={!trip?.members?.length}
            onClick={() => openCreateModal()}
          >
            Новый чек
          </Button>
        </div>
      </section>

      <Dialog.Root open={createOpen} onOpenChange={handleCreateModalChange}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-[2100] bg-black/55 backdrop-blur-[1px] transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
          <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-[2110] max-h-[min(85dvh,calc(100vh-3rem))] w-[min(100vw-1.75rem,28rem)] overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl outline-none">
            <Dialog.Title className="text-lg font-semibold tracking-tight">
              Новый чек
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-muted-foreground">
              Дальше откроется карточка: загрузите фото и запустите разбор.
            </Dialog.Description>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => void onSubmitCreate(e)}
            >
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Название</span>
                <input
                  autoFocus
                  className="rounded-lg border bg-background px-3 py-2 text-sm"
                  placeholder="Ужин в …"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Описание</span>
                <textarea
                  className="resize-y rounded-lg border bg-background px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Необязательно"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-muted-foreground">Оплатил</span>
                <select
                  className="rounded-lg border bg-background px-3 py-2 text-sm"
                  required
                  value={paidByUserId}
                  onChange={(e) => setPaidByUserId(e.target.value)}
                >
                  {trip?.members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                <Dialog.Close
                  type="button"
                  disabled={createSaving}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    "w-full sm:w-auto",
                  )}
                >
                  Отмена
                </Dialog.Close>
                <Button
                  disabled={createSaving || !trip}
                  type="submit"
                  className="w-full sm:w-auto"
                >
                  {createSaving ? "Создаём…" : "Создать и открыть"}
                </Button>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>

      {loading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Чеков пока нет. Нажмите «Новый чек», затем добавьте фото и выполните
          разбор с помощью ИИ.
        </p>
      ) : (
        <ul className="space-y-3">
          {list.map((r) => (
            <li key={r.id}>
              <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
                <Link
                  className="min-w-0 flex-1"
                  href={`/trips/${id}/receipts/${r.id}`}
                >
                  <p className="font-medium hover:underline">{r.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Оплатил:{" "}
                    <span className="text-foreground">{r.paidByUserName}</span>
                  </p>
                  {r.description ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {r.description}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Строк в чеке: {r.lineItemCount}. Сумма:{" "}
                    <span className="text-foreground">
                      {formatMoney(r.totalAmount, r.currency)}
                    </span>
                    {r.imageUrl ? (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-foreground">фото добавлено</span>
                      </>
                    ) : null}
                  </p>
                </Link>
                <Button
                  variant="destructive"
                  size="sm"
                  className="shrink-0"
                  disabled={deletingId === r.id}
                  aria-label={`Удалить чек «${r.title}»`}
                  onClick={() => void removeReceipt(r.id, r.title)}
                >
                  <Trash2 className="size-4 sm:mr-1" aria-hidden />
                  <span className="hidden sm:inline">
                    {deletingId === r.id ? "Удаление…" : "Удалить"}
                  </span>
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
