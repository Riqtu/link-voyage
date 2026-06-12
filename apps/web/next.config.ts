import withPWA from "@ducanh2912/next-pwa";
import type { NextConfig } from "next";

const allowedDevOrigins =
  process.env.NEXT_ALLOWED_DEV_ORIGINS?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
};

export default withPWA({
  dest: "public",
  register: true,
  disable: process.env.NODE_ENV === "development",
  /**
   * По умолчанию next-pwa вешает catch-all `NetworkFirst` на все same-origin GET
   * (кэш `pages`). Для маршрутов без записи в кэше при сбое сети Workbox кидает
   * `no-response`, из-за чего «живут» только уже открытые страницы (часто `/`).
   * Документы и RSC отдаём напрямую в сеть — статика по-прежнему кэшируется дефолтами.
   */
  extendDefaultRuntimeCaching: true,
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ request, url }) => {
          if (!url.pathname.startsWith("/api/")) {
            if (request.mode === "navigate") return true;
            if (request.headers.get("RSC") === "1") return true;
          }
          return false;
        },
        handler: "NetworkOnly",
      },
    ],
  },
})(nextConfig);
