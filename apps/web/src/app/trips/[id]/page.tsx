"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import { cn } from "@/lib/utils";
import { Dialog } from "@base-ui/react/dialog";
import { FileText, Hotel, MapPinned, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type TripDetails = {
  id: string;
  title: string;
  description: string;
  peopleCount: number;
  startDate: string | null;
  endDate: string | null;
  timezone: string;
  housingRequirements: string[];
  viewerRole: "owner" | "member";
  members: {
    userId: string;
    role: "owner" | "member";
    name: string;
  }[];
};

function tripMemberRoleLabel(role: TripDetails["members"][number]["role"]) {
  return role === "owner" ? "Организатор" : "Участник";
}

export default function TripDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [trip, setTrip] = useState<TripDetails | null>(null);
  const [peopleCountField, setPeopleCountField] = useState("");
  const [startDateField, setStartDateField] = useState("");
  const [endDateField, setEndDateField] = useState("");
  const [timezoneField, setTimezoneField] = useState("Europe/Moscow");
  const [requirementsField, setRequirementsField] = useState("");
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);

  async function reloadTripMembersOnly() {
    try {
      const api = getApiClient();
      const result = await api.trip.byId.query({ tripId: id });
      setTrip(result);
    } catch {
      /* список обновится при следующем входе на страницу */
    }
  }

  useEffect(() => {
    async function loadTrip() {
      if (!getAuthToken()) {
        router.replace("/auth");
        return;
      }

      try {
        const api = getApiClient();
        const result = await api.trip.byId.query({ tripId: id });
        setTrip(result);
        setPeopleCountField(String(result.peopleCount));
        setStartDateField(
          result.startDate ? result.startDate.slice(0, 10) : "",
        );
        setEndDateField(result.endDate ? result.endDate.slice(0, 10) : "");
        setTimezoneField(result.timezone);
        setRequirementsField(result.housingRequirements.join(", "));
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось загрузить поездку",
        );
      } finally {
        setIsLoading(false);
      }
    }

    void loadTrip();
  }, [id, router]);

  function handleSettingsModalOpenChange(nextOpen: boolean) {
    if (nextOpen && trip) {
      setPeopleCountField(String(trip.peopleCount));
      setStartDateField(trip.startDate ? trip.startDate.slice(0, 10) : "");
      setEndDateField(trip.endDate ? trip.endDate.slice(0, 10) : "");
      setTimezoneField(trip.timezone);
      setRequirementsField(trip.housingRequirements.join(", "));
      setSettingsSaved(false);
    }
    setSettingsModalOpen(nextOpen);
  }

  useEffect(() => {
    if (!settingsSaved) return;
    const timer = window.setTimeout(() => setSettingsSaved(false), 4000);
    return () => window.clearTimeout(timer);
  }, [settingsSaved]);

  async function removeParticipant(
    userIdToRemove: string,
    displayName: string,
  ) {
    const confirmed = window.confirm(
      `Убрать «${displayName}» из поездки? Пользователь потеряет доступ.`,
    );
    if (!confirmed) return;
    setError(null);
    setRemovingUserId(userIdToRemove);
    try {
      const api = getApiClient();
      await api.trip.removeMember.mutate({
        tripId: id,
        userId: userIdToRemove,
      });
      await reloadTripMembersOnly();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Не удалось удалить участника",
      );
    } finally {
      setRemovingUserId(null);
    }
  }

  async function saveTripSettings() {
    setError(null);
    setSettingsSaved(false);
    const n = parseInt(peopleCountField, 10);
    if (!Number.isFinite(n) || n < 1 || n > 99) {
      setError("Количество людей: от 1 до 99");
      return;
    }
    try {
      const api = getApiClient();
      const requirements = requirementsField
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await api.trip.updateSettings.mutate({
        tripId: id,
        peopleCount: n,
        // null сериализуется в теле запроса; undefined часто режется и не должно сбрасывать даты на API
        startDate: startDateField
          ? new Date(`${startDateField}T00:00:00.000Z`).toISOString()
          : null,
        endDate: endDateField
          ? new Date(`${endDateField}T00:00:00.000Z`).toISOString()
          : null,
        timezone: timezoneField || "Europe/Moscow",
        housingRequirements: requirements,
      });
      setTrip((previous) =>
        previous
          ? {
              ...previous,
              peopleCount: result.peopleCount,
              startDate: result.startDate,
              endDate: result.endDate,
              timezone: result.timezone,
              housingRequirements: result.housingRequirements,
            }
          : previous,
      );
      setSettingsSaved(true);
      setSettingsModalOpen(false);
    } catch (settingsError) {
      setError(
        settingsError instanceof Error
          ? settingsError.message
          : "Не удалось сохранить настройки",
      );
    }
  }

  async function createInvite() {
    try {
      const api = getApiClient();
      const result = await api.trip.createInvite.mutate({ tripId: id });
      setInviteUrl(result.inviteUrl);
      await navigator.clipboard.writeText(result.inviteUrl);
    } catch (inviteError) {
      setError(
        inviteError instanceof Error
          ? inviteError.message
          : "Не удалось создать приглашение",
      );
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Детали поездки
        </h1>
        <nav
          className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:justify-end"
          aria-label="Навигация по странице поездки"
        >
          <Link
            className={cn(
              buttonVariants({ variant: "outline" }),
              "w-full justify-center text-center sm:w-auto sm:min-w-44",
            )}
            href="/trips"
          >
            Назад к списку
          </Link>
        </nav>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загружаем...</p>
      ) : null}
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}

      {trip ? (
        <section className="rounded-2xl border bg-card p-6 shadow-sm">
          <h2 className="text-2xl font-medium">{trip.title}</h2>
          {trip.description ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {trip.description}
            </p>
          ) : null}

          <nav
            className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
            aria-label="Разделы поездки"
          >
            <Link
              href={`/trips/${id}/accommodations`}
              className={cn(
                "group flex min-h-40 flex-col rounded-2xl border border-border bg-linear-to-br from-muted/40 to-muted/10 p-5 text-center shadow-sm transition-colors",
                "hover:border-primary/40 hover:from-muted/55 hover:to-muted/25 hover:shadow-md",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              )}
            >
              <span className="flex min-h-21 flex-1 flex-col items-center justify-center">
                <span className="rounded-2xl border border-primary/15 bg-primary/10 p-4 transition-colors group-hover:border-primary/25 group-hover:bg-primary/14">
                  <Hotel
                    className="size-12 text-primary"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </span>
              </span>
              <span className="mt-4 text-base font-semibold leading-snug text-foreground">
                Сравнение жилья
              </span>
            </Link>
            <Link
              href={`/trips/${id}/map`}
              className={cn(
                "group flex min-h-40 flex-col rounded-2xl border border-border bg-linear-to-br from-muted/40 to-muted/10 p-5 text-center shadow-sm transition-colors",
                "hover:border-primary/40 hover:from-muted/55 hover:to-muted/25 hover:shadow-md",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              )}
            >
              <span className="flex min-h-21 flex-1 flex-col items-center justify-center">
                <span className="rounded-2xl border border-primary/15 bg-primary/10 p-4 transition-colors group-hover:border-primary/25 group-hover:bg-primary/14">
                  <MapPinned
                    className="size-12 text-primary"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </span>
              </span>
              <span className="mt-4 text-base font-semibold leading-snug text-foreground">
                Карта
              </span>
            </Link>
            <Link
              href={`/trips/${id}/documents`}
              className={cn(
                "group flex min-h-40 flex-col rounded-2xl border border-border bg-linear-to-br from-muted/40 to-muted/10 p-5 text-center shadow-sm transition-colors",
                "hover:border-primary/40 hover:from-muted/55 hover:to-muted/25 hover:shadow-md",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
              )}
            >
              <span className="flex min-h-21 flex-1 flex-col items-center justify-center">
                <span className="rounded-2xl border border-primary/15 bg-primary/10 p-4 transition-colors group-hover:border-primary/25 group-hover:bg-primary/14">
                  <FileText
                    className="size-12 text-primary"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </span>
              </span>
              <span className="mt-4 text-base font-semibold leading-snug text-foreground">
                Документы
              </span>
            </Link>
          </nav>

          <div className="mt-6 rounded-xl border bg-muted/30 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-medium">Настройки поездки</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Нужны для расчёта «цена за человека» и ночей при сравнении
                  жилья.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="text-foreground">Людей:</span>{" "}
                  {trip.peopleCount}
                  {trip.startDate && trip.endDate ? (
                    <>
                      {" "}
                      · <span className="text-foreground">Даты:</span>{" "}
                      {trip.startDate.slice(0, 10)} →{" "}
                      {trip.endDate.slice(0, 10)}
                    </>
                  ) : (
                    <>
                      {" "}
                      · <span className="text-foreground">Даты:</span> не
                      указаны
                    </>
                  )}
                </p>
                {settingsSaved ? (
                  <p className="mt-2 text-xs text-green-700 dark:text-green-400">
                    Настройки сохранены.
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="secondary"
                className="shrink-0 self-start sm:self-center"
                onClick={() => handleSettingsModalOpenChange(true)}
              >
                Настройки поездки
              </Button>
            </div>
          </div>

          <Dialog.Root
            open={settingsModalOpen}
            onOpenChange={handleSettingsModalOpenChange}
          >
            <Dialog.Portal>
              <Dialog.Backdrop className="fixed inset-0 z-[2100] bg-black/55 backdrop-blur-[1px] transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
              <Dialog.Popup className="-translate-x-1/2 -translate-y-1/2 fixed top-1/2 left-1/2 z-[2110] max-h-[min(85dvh,calc(100vh-3rem))] w-[min(100vw-1.75rem,28rem)] overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl outline-none">
                <Dialog.Title className="text-lg font-semibold tracking-tight">
                  Настройки поездки
                </Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                  Сохранение применит число человек, даты, таймзону и список
                  требований к жилью.
                </Dialog.Description>

                <div className="mt-4 grid gap-3">
                  <label className="flex flex-col gap-1 text-xs md:col-span-2">
                    <span className="text-muted-foreground">
                      Количество человек
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      className="w-full max-w-32 rounded-lg border bg-background px-3 py-2 text-sm"
                      value={peopleCountField}
                      onChange={(event) =>
                        setPeopleCountField(event.target.value)
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Дата начала</span>
                    <input
                      type="date"
                      className="rounded-lg border bg-background px-3 py-2 text-sm"
                      value={startDateField}
                      onChange={(event) =>
                        setStartDateField(event.target.value)
                      }
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Дата конца</span>
                    <input
                      type="date"
                      className="rounded-lg border bg-background px-3 py-2 text-sm"
                      value={endDateField}
                      onChange={(event) => setEndDateField(event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">Таймзона</span>
                    <input
                      className="rounded-lg border bg-background px-3 py-2 text-sm"
                      value={timezoneField}
                      onChange={(event) => setTimezoneField(event.target.value)}
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-xs">
                    <span className="text-muted-foreground">
                      Требования к жилью (через запятую)
                    </span>
                    <input
                      className="rounded-lg border bg-background px-3 py-2 text-sm"
                      placeholder="wifi, кухня, рядом с центром"
                      value={requirementsField}
                      onChange={(event) =>
                        setRequirementsField(event.target.value)
                      }
                    />
                  </label>
                </div>

                <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <Dialog.Close
                    type="button"
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full sm:w-auto",
                    )}
                  >
                    Отмена
                  </Dialog.Close>
                  <Button
                    type="button"
                    className="w-full sm:w-auto"
                    onClick={() => void saveTripSettings()}
                  >
                    Сохранить
                  </Button>
                </div>
              </Dialog.Popup>
            </Dialog.Portal>
          </Dialog.Root>

          <div className="mt-6">
            <h3 className="text-sm font-medium">Участники</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              В списке — имя и роль. Удалять может только организатор поездки.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Всего: {trip.members.length}
            </p>
            <ul className="mt-3 divide-y divide-border rounded-xl border bg-muted/20">
              {trip.members.map((member) => {
                const canRemove =
                  trip.viewerRole === "owner" && member.role !== "owner";
                return (
                  <li
                    key={member.userId}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">
                        {member.name}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {tripMemberRoleLabel(member.role)}
                      </p>
                    </div>
                    {canRemove ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        disabled={removingUserId === member.userId}
                        aria-label={`Удалить ${member.name} из поездки`}
                        onClick={() =>
                          void removeParticipant(member.userId, member.name)
                        }
                      >
                        <Trash2 className="size-4 sm:mr-1" aria-hidden />
                        <span className="hidden sm:inline">
                          {removingUserId === member.userId
                            ? "Удаляем..."
                            : "Удалить"}
                        </span>
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-6">
            <Button onClick={createInvite}>Создать ссылку-приглашение</Button>
            {inviteUrl ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Ссылка скопирована:{" "}
                <a className="underline" href={inviteUrl}>
                  {inviteUrl}
                </a>
              </p>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
