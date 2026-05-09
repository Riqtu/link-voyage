"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import {
  LV_DIALOG_BACKDROP_MOTION_CLASS,
  LV_DIALOG_POPUP_MOTION_CLASS,
} from "@/lib/lv-motion";
import {
  tripTimezoneOptionsForGroup,
  tripTimezoneSelectModel,
} from "@/lib/trip-timezone-options";
import { cn } from "@/lib/utils";
import { Dialog } from "@base-ui/react/dialog";
import { ChevronRight, ListChecks, Trash2, User } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

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
    firstName: string;
    lastName: string;
    email: string;
    avatarUrl: string | null;
    displayName: string;
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
  const settingsFormId = useId();

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

  const timezoneSelectModel = useMemo(
    () => tripTimezoneSelectModel(timezoneField),
    [timezoneField],
  );

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

          <div className="mt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Подготовка
            </p>
            <Link
              href={`/trips/${id}/checklist`}
              className={cn(
                buttonVariants({ variant: "outline" }),
                // base size задаёт h-8 — ломает многострочный ряд и иконку; явно даём высоту по содержимому
                "mt-2 flex h-auto min-h-0 min-w-0 w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left font-normal whitespace-normal shadow-sm transition-colors sm:gap-3 sm:px-4 sm:py-3",
                "border-border hover:border-primary/35 hover:bg-muted/50",
              )}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
                <span
                  aria-hidden
                  className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/15 bg-primary/10 text-primary"
                >
                  <ListChecks className="size-4 shrink-0" strokeWidth={1.75} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    Мой чеклист
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    Личный список вещей; видите только вы
                  </span>
                </span>
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </Link>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Разделы поездки — в нижней панели: карта, жильё, чеклист, чеки и
            документы.
          </p>

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
              <div className="fixed inset-0 z-[2100] flex items-center justify-center overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
                <Dialog.Backdrop
                  className={cn(
                    "absolute inset-0 z-0 bg-black/55 backdrop-blur-[1px]",
                    LV_DIALOG_BACKDROP_MOTION_CLASS,
                  )}
                />
                <Dialog.Popup
                  className={cn(
                    "relative z-10 my-6 w-[min(100vw-2rem,32rem)] max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-3rem))] overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl outline-none",
                    LV_DIALOG_POPUP_MOTION_CLASS,
                  )}
                >
                  <Dialog.Title className="text-lg font-semibold tracking-tight">
                    Настройки поездки
                  </Dialog.Title>
                  <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                    Сохранение применит число человек, даты, таймзону и список
                    требований к жилью.
                  </Dialog.Description>

                  <div className="mt-4 space-y-4">
                    <div className="space-y-1">
                      <label
                        className="block text-xs text-muted-foreground leading-snug"
                        htmlFor={`${settingsFormId}-people`}
                      >
                        Количество человек
                      </label>
                      <input
                        id={`${settingsFormId}-people`}
                        type="number"
                        min={1}
                        max={99}
                        className="h-10 w-full max-w-32 rounded-lg border border-input bg-background px-3 text-sm"
                        value={peopleCountField}
                        onChange={(event) =>
                          setPeopleCountField(event.target.value)
                        }
                      />
                    </div>

                    <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-2">
                      <label
                        className="text-xs text-muted-foreground leading-snug"
                        htmlFor={`${settingsFormId}-start`}
                      >
                        Дата начала
                      </label>
                      <label
                        className="text-xs text-muted-foreground leading-snug"
                        htmlFor={`${settingsFormId}-end`}
                      >
                        Дата конца
                      </label>
                      <input
                        id={`${settingsFormId}-start`}
                        type="date"
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        value={startDateField}
                        onChange={(event) =>
                          setStartDateField(event.target.value)
                        }
                      />
                      <input
                        id={`${settingsFormId}-end`}
                        type="date"
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        value={endDateField}
                        onChange={(event) =>
                          setEndDateField(event.target.value)
                        }
                      />
                    </div>

                    <div className="grid gap-x-3 gap-y-1.5 sm:grid-cols-2">
                      <label
                        className="self-end text-pretty text-xs text-muted-foreground leading-snug"
                        htmlFor={`${settingsFormId}-tz`}
                      >
                        Таймзона
                      </label>
                      <label
                        className="text-pretty text-xs text-muted-foreground leading-snug"
                        htmlFor={`${settingsFormId}-housing`}
                      >
                        Требования к жилью (через запятую)
                      </label>
                      <select
                        id={`${settingsFormId}-tz`}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        value={timezoneField}
                        onChange={(event) =>
                          setTimezoneField(event.target.value)
                        }
                      >
                        {timezoneSelectModel.extraGroup ? (
                          <optgroup label="Сохранённое значение">
                            {timezoneSelectModel.extraGroup.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </optgroup>
                        ) : null}
                        {timezoneSelectModel.groups.map((groupName) => (
                          <optgroup key={groupName} label={groupName}>
                            {tripTimezoneOptionsForGroup(groupName).map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                      <input
                        id={`${settingsFormId}-housing`}
                        className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                        placeholder="wifi, кухня, рядом с центром"
                        value={requirementsField}
                        onChange={(event) =>
                          setRequirementsField(event.target.value)
                        }
                      />
                    </div>
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
              </div>
            </Dialog.Portal>
          </Dialog.Root>

          <div className="mt-6">
            <h3 className="text-sm font-medium">Участники</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Аватары, имена, email и роль. Удалять участника может только
              организатор.
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Всего: {trip.members.length}
            </p>
            <ul className="mt-3 divide-y divide-border rounded-xl border bg-muted/20">
              {trip.members.map((member) => {
                const canRemove =
                  trip.viewerRole === "owner" && member.role !== "owner";
                const fullName = member.displayName;
                const reserveDeleteSlot = trip.viewerRole === "owner";
                return (
                  <li
                    key={member.userId}
                    className="flex items-center gap-3 px-3 py-3 text-sm"
                  >
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                      {member.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL из S3 участника
                        <img
                          src={member.avatarUrl}
                          alt=""
                          className="absolute inset-0 size-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <User className="size-5" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {fullName}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {member.email ? member.email : "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-medium uppercase leading-none tracking-wide text-primary">
                        {tripMemberRoleLabel(member.role)}
                      </span>
                      {reserveDeleteSlot ? (
                        canRemove ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={removingUserId === member.userId}
                            aria-busy={
                              removingUserId === member.userId || undefined
                            }
                            aria-label={
                              removingUserId === member.userId
                                ? `Удаляем ${member.displayName} из поездки`
                                : `Удалить ${member.displayName} из поездки`
                            }
                            onClick={() =>
                              void removeParticipant(
                                member.userId,
                                member.displayName,
                              )
                            }
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </Button>
                        ) : (
                          <span
                            className="pointer-events-none invisible inline-flex shrink-0"
                            aria-hidden
                          >
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled
                              tabIndex={-1}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </Button>
                          </span>
                        )
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-6">
            <Button onClick={createInvite}>Создать ссылку-приглашение</Button>
            {inviteUrl ? (
              <p className="mt-3 min-w-0 text-sm text-muted-foreground">
                Ссылка скопирована:{" "}
                <a className="underline break-all" href={inviteUrl}>
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
