"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
import {
  LV_MODAL_BACKDROP_ENTER_CLASS,
  LV_MODAL_PANEL_ENTER_CLASS,
  lvStaggerStyle,
} from "@/lib/lv-motion";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

type TripListItem = {
  id: string;
  title: string;
  description: string;
  membersCount: number;
};

export default function TripsPage() {
  const router = useRouter();
  const [trips, setTrips] = useState<TripListItem[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [peopleCount, setPeopleCount] = useState("4");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createShakeEpoch, setCreateShakeEpoch] = useState(0);
  const [createShakePlay, setCreateShakePlay] = useState(false);

  const loadTrips = useCallback(async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }

    try {
      setIsLoading(true);
      const api = getApiClient();
      const result = await api.trip.list.query();
      setTrips(result);
    } catch (loadError) {
      clearAuthToken();
      router.replace("/auth");
      if (loadError instanceof Error) {
        setError(loadError.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  const resetCreateForm = useCallback(() => {
    setTitle("");
    setDescription("");
    setPeopleCount("4");
    setError(null);
  }, []);

  const closeCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
    resetCreateForm();
  }, [resetCreateForm]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTrips();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadTrips]);

  useEffect(() => {
    if (!isCreateModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCreateModal();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isCreateModalOpen, closeCreateModal]);

  useEffect(() => {
    if (!createShakeEpoch) return;
    setCreateShakePlay(true);
    const timer = window.setTimeout(() => setCreateShakePlay(false), 460);
    return () => window.clearTimeout(timer);
  }, [createShakeEpoch]);

  async function onCreateTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const api = getApiClient();
      const p = parseInt(peopleCount, 10);
      await api.trip.create.mutate({
        title,
        description,
        peopleCount: Number.isFinite(p) && p >= 1 && p <= 99 ? p : undefined,
      });
      closeCreateModal();
      await loadTrips();
    } catch (createError) {
      setCreateShakeEpoch((epoch) => epoch + 1);
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать поездку",
      );
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Мои поездки</h1>
          <p className="text-sm text-muted-foreground">
            Создавайте поездки, приглашайте друзей и собирайте общий план.
          </p>
        </div>
        <Button
          type="button"
          className="self-start sm:self-auto"
          onClick={() => setIsCreateModalOpen(true)}
        >
          <Plus className="mr-1.5 size-4" aria-hidden />
          Новая поездка
        </Button>
      </div>

      {isCreateModalOpen ? (
        <div
          className={cn(
            "fixed inset-0 z-[2000] flex items-center justify-center overflow-y-auto overscroll-y-contain bg-black/50 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]",
            LV_MODAL_BACKDROP_ENTER_CLASS,
          )}
          onClick={closeCreateModal}
          role="presentation"
        >
          <div
            className={cn(
              "my-6 max-h-[min(90dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem))] w-full max-w-lg overflow-y-auto rounded-2xl border bg-background p-5 shadow-2xl",
              LV_MODAL_PANEL_ENTER_CLASS,
            )}
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-trip-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="create-trip-modal-title" className="text-lg font-medium">
                Новая поездка
              </h2>
              <Button
                type="button"
                variant="outline"
                onClick={closeCreateModal}
              >
                Закрыть
              </Button>
            </div>
            <form
              onSubmit={onCreateTrip}
              className={cn(
                "mt-4 space-y-3",
                createShakePlay && "lv-shake-once",
              )}
            >
              {error ? (
                <p className="text-sm text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                placeholder="Название поездки"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                autoFocus
              />
              <textarea
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                placeholder="Короткое описание (необязательно)"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
              />
              <input
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
                placeholder="Количество человек (для цены за человека)"
                type="number"
                min={1}
                max={99}
                value={peopleCount}
                onChange={(event) => setPeopleCount(event.target.value)}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit">Создать поездку</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeCreateModal}
                >
                  Отмена
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div
          className="grid gap-3"
          aria-busy="true"
          aria-label="Загрузка списка поездок"
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`sk-${i}`}
              className="rounded-2xl border bg-muted/20 p-5 shadow-none"
              style={lvStaggerStyle(i)}
            >
              <div className="h-5 w-[min(100%,14rem)] rounded-md bg-muted/60 motion-safe:animate-pulse motion-reduce:bg-muted/40" />
              <div className="mt-3 h-3 w-full max-w-md rounded-md bg-muted/35 motion-safe:animate-pulse motion-reduce:bg-muted/30" />
              <div className="mt-2 h-3 w-48 rounded-md bg-muted/35 motion-safe:animate-pulse motion-reduce:bg-muted/30" />
              <div className="mt-4 h-3 w-36 rounded-md bg-muted/30 motion-safe:animate-pulse motion-reduce:bg-muted/28" />
            </div>
          ))}
        </div>
      ) : trips.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-muted/25 px-6 py-10 text-center motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300 motion-safe:ease-out">
          <p className="text-sm text-muted-foreground">
            Пока нет поездок. Создайте первую через кнопку «Новая поездка».
          </p>
          <Button
            type="button"
            className="mt-4"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus className="mr-1.5 size-4" aria-hidden />
            Новая поездка
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          {trips.map((trip, index) => (
            <article
              key={trip.id}
              className={cn(
                "rounded-2xl border bg-card p-5 shadow-sm",
                "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:zoom-in-95 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:ease-out",
              )}
              style={lvStaggerStyle(index)}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-medium">{trip.title}</h3>
                  {trip.description ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {trip.description}
                    </p>
                  ) : null}
                </div>
                <Link className={buttonVariants()} href={`/trips/${trip.id}`}>
                  Открыть
                </Link>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Участников: {trip.membersCount}
              </p>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
