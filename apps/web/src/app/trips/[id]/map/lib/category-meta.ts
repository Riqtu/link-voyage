import type { TripPoint } from "./types";

export const categoryOptions: Array<{
  value: TripPoint["category"];
  label: string;
}> = [
  { value: "sight", label: "Место" },
  { value: "food", label: "Еда" },
  { value: "stay", label: "Жилье" },
  { value: "transport", label: "Транспорт" },
  { value: "other", label: "Другое" },
];

export const categoryLabelByValue: Record<TripPoint["category"], string> = {
  sight: "Достопримечательность",
  food: "Еда и кафе",
  stay: "Проживание",
  transport: "Транспорт",
  other: "Другое место",
};
