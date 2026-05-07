/**
 * Цвет статус-бара / PWA-хрома (приближённо к новым semantic token’ам страницы).
 * Смотри --background в `globals.css`.
 */
/** Светлый фон после теплого офф-белого (--background) */
export const THEME_COLOR_LIGHT = "#f9f8f5";
/** Почти чёрный статус-бар (слегка смягчает halo у OLED, около --background в .dark) */
export const THEME_COLOR_DARK = "#111110";

/**
 * Приведение оформления вне страницы (вкладка, iOS standalone) к активной теме приложения,
 * включая режим когда системная тема и тема в localStorage расходятся.
 */
export function syncStandaloneChrome(resolved: "light" | "dark") {
  if (typeof document === "undefined") return;
  const content = resolved === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
    el.setAttribute("content", content);
  });
  const bar = document.querySelector(
    'meta[name="apple-mobile-web-app-status-bar-style"]',
  );
  if (bar) {
    bar.setAttribute("content", resolved === "dark" ? "black" : "default");
  }
}
