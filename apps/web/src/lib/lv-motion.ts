import { cn } from "@/lib/utils";

/**
 * Вход при смене раздела поездки (`globals.css` → `.lv-page-segment-enter`).
 * Только opacity: transform на предке ломает `position: fixed` на карте/модалках.
 */
export const LV_PAGE_SEGMENT_ENTER_CLASS = "lv-page-segment-enter";

/**
 * Появление контента после загрузки данных (чеклист и т.п.) — только opacity.
 */
export const LV_DATA_LOADED_ENTER_CLASS = "lv-data-loaded-enter";

/** Подложка модалки (полноэкранный оверлей без Dialog). */
export const LV_MODAL_BACKDROP_ENTER_CLASS =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200";

/** Карточка модалки (центрирование без Dialog). */
export const LV_MODAL_PANEL_ENTER_CLASS =
  "motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-4 motion-safe:zoom-in-95 motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.33,1,0.68,1)] motion-safe:fill-mode-both";

/** Base UI Dialog: затемнение с плавным появлением/уходом. */
export const LV_DIALOG_BACKDROP_MOTION_CLASS = cn(
  "transition-opacity motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.33,1,0.68,1)]",
  "data-[starting-style]:opacity-0 data-[ending-style]:opacity-0",
);

/** Base UI Dialog: плавное появление попапа. */
export const LV_DIALOG_POPUP_MOTION_CLASS = cn(
  "motion-safe:origin-center motion-safe:transition-[opacity,transform] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.33,1,0.68,1)]",
  "motion-safe:data-[starting-style]:translate-y-2 motion-safe:data-[starting-style]:scale-[0.96] motion-safe:data-[starting-style]:opacity-0",
  "motion-safe:data-[ending-style]:translate-y-2 motion-safe:data-[ending-style]:scale-[0.96] motion-safe:data-[ending-style]:opacity-0",
  "motion-reduce:transition-opacity motion-reduce:duration-200",
  "motion-reduce:data-[starting-style]:translate-y-0 motion-reduce:data-[starting-style]:scale-100",
  "motion-reduce:data-[ending-style]:translate-y-0 motion-reduce:data-[ending-style]:scale-100",
);

/** Stagger: задержка по индексу (макс. шаг для длинных списков). */
export function lvStaggerStyle(index: number, stepMs = 48, cap = 20) {
  return { animationDelay: `${Math.min(index, cap) * stepMs}ms` } as const;
}
