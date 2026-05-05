"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

const TripMap = dynamic(
  () => import("@/components/trip-map").then((mod) => mod.TripMap),
  { ssr: false },
);

type TripPoint = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["tripPoint"]["list"]["query"]>
>[number];

const categoryOptions: Array<{ value: TripPoint["category"]; label: string }> =
  [
    { value: "sight", label: "Место" },
    { value: "food", label: "Еда" },
    { value: "stay", label: "Жилье" },
    { value: "transport", label: "Транспорт" },
    { value: "other", label: "Другое" },
  ];

export default function TripMapPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [points, setPoints] = useState<TripPoint[]>([]);
  const [selectedLat, setSelectedLat] = useState<number | null>(null);
  const [selectedLng, setSelectedLng] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<TripPoint["category"]>("sight");
  const [plannedAt, setPlannedAt] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const center = useMemo(() => {
    if (points.length > 0) {
      return { lat: points[0].coordinates.lat, lng: points[0].coordinates.lng };
    }
    return { lat: 55.751244, lng: 37.618423 };
  }, [points]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setCategory("sight");
    setPlannedAt("");
  }, []);

  const loadPoints = useCallback(async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const result = await api.tripPoint.list.query({ tripId: id });
      setPoints(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось загрузить точки",
      );
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPoints();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPoints]);

  async function savePoint() {
    if (selectedLat === null || selectedLng === null) {
      setError("Кликните по карте, чтобы выбрать координаты");
      return;
    }
    if (!title.trim()) {
      setError("Введите название точки");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const api = getApiClient();
      if (editingId) {
        await api.tripPoint.update.mutate({
          pointId: editingId,
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          coordinates: { lat: selectedLat, lng: selectedLng },
          plannedAt: plannedAt
            ? new Date(`${plannedAt}:00.000Z`).toISOString()
            : undefined,
        });
      } else {
        await api.tripPoint.create.mutate({
          tripId: id,
          title: title.trim(),
          description: description.trim() || undefined,
          category,
          coordinates: { lat: selectedLat, lng: selectedLng },
          plannedAt: plannedAt
            ? new Date(`${plannedAt}:00.000Z`).toISOString()
            : undefined,
        });
      }
      await loadPoints();
      resetForm();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить точку",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function removePoint(pointId: string) {
    setError(null);
    try {
      const api = getApiClient();
      await api.tripPoint.delete.mutate({ pointId });
      await loadPoints();
      if (editingId === pointId) {
        resetForm();
      }
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Не удалось удалить точку",
      );
    }
  }

  function beginEdit(point: TripPoint) {
    setEditingId(point.id);
    setTitle(point.title);
    setDescription(point.description ?? "");
    setCategory(point.category);
    setSelectedLat(point.coordinates.lat);
    setSelectedLng(point.coordinates.lng);
    setPlannedAt(point.plannedAt ? point.plannedAt.slice(0, 16) : "");
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-7xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Карта поездки</h1>
        <div className="flex gap-2">
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/trips/${id}`}
          >
            Детали поездки
          </Link>
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/trips/${id}/accommodations`}
          >
            Жилье
          </Link>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section className="h-[65vh] rounded-xl border bg-card p-2">
          {isLoading ? (
            <p className="p-3 text-sm text-muted-foreground">
              Загружаем карту...
            </p>
          ) : (
            <TripMap
              center={center}
              points={points}
              onSelect={(lat, lng) => {
                setSelectedLat(lat);
                setSelectedLng(lng);
              }}
            />
          )}
        </section>

        <aside className="space-y-4 rounded-xl border bg-card p-4">
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">
              {editingId ? "Редактирование точки" : "Новая точка"}
            </h2>
            <input
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="Название"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <textarea
              className="min-h-20 w-full rounded-lg border bg-background px-3 py-2 text-sm"
              placeholder="Описание"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <select
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as TripPoint["category"])
              }
            >
              {categoryOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              value={plannedAt}
              onChange={(event) => setPlannedAt(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Координаты:{" "}
              {selectedLat !== null && selectedLng !== null
                ? `${selectedLat.toFixed(5)}, ${selectedLng.toFixed(5)}`
                : "не выбраны"}
            </p>
            <div className="flex gap-2">
              <Button disabled={isSaving} onClick={savePoint}>
                {editingId ? "Сохранить" : "Добавить"}
              </Button>
              {editingId ? (
                <Button variant="outline" onClick={resetForm}>
                  Отмена
                </Button>
              ) : null}
            </div>
          </div>

          <div className="space-y-2 border-t pt-3">
            <h3 className="text-sm font-semibold">Точки ({points.length})</h3>
            <ul className="space-y-2">
              {points.map((point) => (
                <li key={point.id} className="rounded-lg border p-2">
                  <p className="text-sm font-medium">{point.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {point.category}
                  </p>
                  {point.description ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {point.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    {point.coordinates.lat.toFixed(5)},{" "}
                    {point.coordinates.lng.toFixed(5)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => beginEdit(point)}
                    >
                      Изменить
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => void removePoint(point.id)}
                    >
                      Удалить
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </main>
  );
}
