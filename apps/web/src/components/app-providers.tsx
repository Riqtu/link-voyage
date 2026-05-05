"use client";

import { SiteHeader } from "@/components/site-header";
import { ThemeProvider } from "@/components/theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SiteHeader />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </ThemeProvider>
  );
}
