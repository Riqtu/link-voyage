import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Link Voyage",
    short_name: "Voyage",
    description: "Collaborative trip planning with friends",
    start_url: "/",
    display: "standalone",
    /** Тёмный фон загрузки standalone: чёрная полоса сверху при #fff и тёмной теме. */
    background_color: "#171717",
    theme_color: "#171717",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
