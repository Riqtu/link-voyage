"use client";

import { AppChrome } from "@/components/navigation/app-chrome";
import { ThemeProvider } from "@/components/theme-provider";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <AppChrome />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </ThemeProvider>
  );
}
