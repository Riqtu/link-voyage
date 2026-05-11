"use client";

import { Button } from "@/components/ui/button";
import type { ModalCurrency } from "../../lib/types";
import type { AccommodationFormModalPanelProps } from "./types";

export type AccommodationFormPricingFieldsProps = Pick<
  AccommodationFormModalPanelProps,
  | "price"
  | "setPrice"
  | "currency"
  | "setCurrency"
  | "formUsdToRubTotal"
  | "peopleCount"
  | "formatRubAmount"
  | "rating"
  | "setRating"
  | "freeCancellation"
  | "setFreeCancellation"
  | "amenitiesInput"
  | "setAmenitiesInput"
  | "notes"
  | "setNotes"
  | "editingId"
  | "resetForm"
>;

export function AccommodationFormPricingFields({
  price,
  setPrice,
  currency,
  setCurrency,
  formUsdToRubTotal,
  peopleCount,
  formatRubAmount,
  rating,
  setRating,
  freeCancellation,
  setFreeCancellation,
  amenitiesInput,
  setAmenitiesInput,
  notes,
  setNotes,
  editingId,
  resetForm,
}: AccommodationFormPricingFieldsProps) {
  return (
    <>
      <input
        className="rounded-lg border bg-background px-3 py-2 text-sm"
        placeholder="Введите цену согласно выбранному типу"
        type="number"
        min={0}
        step="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
      />
      <select
        className="rounded-lg border bg-background px-3 py-2 text-sm"
        value={currency}
        onChange={(e) => setCurrency(e.target.value as ModalCurrency)}
        aria-label="Валюта цены"
      >
        <option value="USD">USD — доллар США</option>
        <option value="EUR">EUR — евро</option>
        <option value="RUB">RUB — российский рубль</option>
      </select>
      {formUsdToRubTotal !== null ? (
        <p className="text-xs text-muted-foreground md:col-span-2">
          Ориентировочно по курсу ЦБ: общая сумма в пересчёте ≈{" "}
          <span className="tabular-nums text-foreground">
            {formatRubAmount(formUsdToRubTotal)}
          </span>
          {peopleCount > 1 ? (
            <>
              {" "}
              (≈ {formatRubAmount(
                formUsdToRubTotal / Math.max(1, peopleCount),
              )}{" "}
              на человека)
            </>
          ) : null}
        </p>
      ) : null}
      <input
        className="rounded-lg border bg-background px-3 py-2 text-sm"
        placeholder="Рейтинг 0–10 (если есть на странице)"
        type="number"
        min={0}
        max={10}
        step="0.1"
        value={rating}
        onChange={(e) => setRating(e.target.value)}
      />
      <label className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm md:col-span-2">
        <input
          type="checkbox"
          checked={freeCancellation}
          onChange={(e) => setFreeCancellation(e.target.checked)}
        />
        Бесплатная отмена
      </label>
      <input
        className="rounded-lg border bg-background px-3 py-2 text-sm md:col-span-2"
        placeholder="Удобства через запятую (Wi‑Fi, парковка, кухня…)"
        value={amenitiesInput}
        onChange={(e) => setAmenitiesInput(e.target.value)}
      />
      <textarea
        className="rounded-lg border bg-background px-3 py-2 text-sm md:col-span-2"
        placeholder="Заметки команде"
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      <div className="md:col-span-2 flex gap-2">
        <Button type="submit">
          {editingId ? "Сохранить изменения" : "Добавить"}
        </Button>
        <Button type="button" variant="outline" onClick={resetForm}>
          Отменить
        </Button>
      </div>
    </>
  );
}
