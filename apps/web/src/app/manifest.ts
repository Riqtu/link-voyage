import type { MetadataRoute } from "next";

import { THEME_COLOR_DARK } from "@/lib/theme-chrome";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Link Voyage",
    short_name: "Voyage",
    description: "Collaborative trip planning with friends",
    start_url: "/",
    display: "standalone",
    /** Инициализация standalone: тот же тёмный тон, что и в токенах страницы */
    background_color: THEME_COLOR_DARK,
    theme_color: THEME_COLOR_DARK,
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
