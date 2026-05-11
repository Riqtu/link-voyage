"use client";

import { Button, buttonVariants } from "@/components/ui/button";
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
import { type Dispatch, type SetStateAction, useMemo } from "react";

type TimezoneSelectModel = ReturnType<typeof tripTimezoneSelectModel>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settingsFormId: string;
  peopleCountField: string;
  setPeopleCountField: Dispatch<SetStateAction<string>>;
  startDateField: string;
  setStartDateField: Dispatch<SetStateAction<string>>;
  endDateField: string;
  setEndDateField: Dispatch<SetStateAction<string>>;
  timezoneField: string;
  setTimezoneField: Dispatch<SetStateAction<string>>;
  requirementsField: string;
  setRequirementsField: Dispatch<SetStateAction<string>>;
  onSave: () => void;
};

export function TripSettingsDialog({
  open,
  onOpenChange,
  settingsFormId,
  peopleCountField,
  setPeopleCountField,
  startDateField,
  setStartDateField,
  endDateField,
  setEndDateField,
  timezoneField,
  setTimezoneField,
  requirementsField,
  setRequirementsField,
  onSave,
}: Props) {
  const timezoneSelectModel: TimezoneSelectModel = useMemo(
    () => tripTimezoneSelectModel(timezoneField),
    [timezoneField],
  );

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
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
                  onChange={(event) => setPeopleCountField(event.target.value)}
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
                  onChange={(event) => setStartDateField(event.target.value)}
                />
                <input
                  id={`${settingsFormId}-end`}
                  type="date"
                  className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                  value={endDateField}
                  onChange={(event) => setEndDateField(event.target.value)}
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
                  onChange={(event) => setTimezoneField(event.target.value)}
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
                  onChange={(event) => setRequirementsField(event.target.value)}
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
                onClick={() => void onSave()}
              >
                Сохранить
              </Button>
            </div>
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
