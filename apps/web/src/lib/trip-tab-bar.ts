/**
 * Общее смещение от низа экрана под фиксированный таб-бар поездки
 * ({@link TripBottomTabBar}: h-14 + pb safe-area внутри панели).
 * Вешать класс только на корневую обёртку маршрута `/trips/[id]`.
 */
export const LV_TRIP_TAB_SHELL =
  "[--lv-trip-tab-recess:calc(3.5rem+env(safe-area-inset-bottom,0px))]" as const;
