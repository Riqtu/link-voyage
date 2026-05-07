import { AppProviders } from "@/components/app-providers";
import { THEME_COLOR_DARK, THEME_COLOR_LIGHT } from "@/lib/theme-chrome";
import type { Metadata, Viewport } from "next";
import { Geist_Mono, Manrope } from "next/font/google";
import Script from "next/script";
import "./globals.css";

/**
 * Manrope: хорошо держит кириллицу при латинице, variable, без «несобранности» апперкейса.
 */
const manrope = Manrope({
  variable: "--font-sans",
  subsets: ["latin", "cyrillic", "cyrillic-ext", "latin-ext"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Link Voyage",
  description: "Collaborative travel planning with friends",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    /** Статичный SSR-фолбэк; фактический стиль задаёт bootstrap + ThemeProvider (см. theme-chrome). */
    statusBarStyle: "default",
    title: "Link Voyage",
  },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR_DARK },
  ],
  viewportFit: "cover",
};

const themeBootScript = `
(function(){
  var D=${JSON.stringify(THEME_COLOR_DARK)};
  var L=${JSON.stringify(THEME_COLOR_LIGHT)};
  try {
    var t=localStorage.getItem("theme");
    var r=t==="dark"?"dark":t==="light"?"light":(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");
    var root=document.documentElement;
    root.classList.add(r);
    root.style.colorScheme=r;
    document.querySelectorAll('meta[name="theme-color"]').forEach(function(el){ el.setAttribute("content", r==="dark"?D:L); });
    var b=document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if(b) b.setAttribute("content", r==="dark"?"black":"default");
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${manrope.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <Script id="lv-theme-boot" strategy="beforeInteractive">
          {themeBootScript}
        </Script>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
