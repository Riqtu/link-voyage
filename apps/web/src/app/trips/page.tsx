"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadTrips();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadTrips]);

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
      setTitle("");
      setDescription("");
      setPeopleCount("4");
      await loadTrips();
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Не удалось создать поездку",
      );
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold">Мои поездки</h1>
          <p className="text-sm text-muted-foreground">
            Создавайте поездки, приглашайте друзей и собирайте общий план.
          </p>
        </div>
        <div className="flex gap-2">
          <Link className={buttonVariants({ variant: "outline" })} href="/">
            Главная
          </Link>
          <Button
            variant="outline"
            onClick={() => {
              clearAuthToken();
              router.push("/auth");
            }}
          >
            Выйти
          </Button>
        </div>
      </div>

      <form
        onSubmit={onCreateTrip}
        className="mb-6 rounded-2xl border bg-card p-5 shadow-sm"
      >
        <h2 className="text-lg font-medium">Новая поездка</h2>
        <div className="mt-3 space-y-3">
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            placeholder="Название поездки"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
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
          <Button type="submit">Создать поездку</Button>
        </div>
      </form>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загружаем поездки...</p>
      ) : trips.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Пока нет поездок. Создайте первую.
        </p>
      ) : (
        <div className="grid gap-3">
          {trips.map((trip) => (
            <article
              key={trip.id}
              className="rounded-2xl border bg-card p-5 shadow-sm"
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
