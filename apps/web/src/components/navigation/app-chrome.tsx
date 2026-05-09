"use client";

import { useAuthSession } from "@/hooks/use-auth-session";
import { usePathname } from "next/navigation";
import { AppGuestChrome } from "./app-guest-chrome";
import { FloatingProfile } from "./floating-profile";
import { MarketingHeader } from "./marketing-header";

function isMarketingPath(pathname: string): boolean {
  if (pathname === "/" || pathname === "/auth") return true;
  if (pathname.startsWith("/join/")) return true;
  return false;
}

export function AppChrome() {
  const pathname = usePathname();
  const { session } = useAuthSession();

  if (isMarketingPath(pathname)) {
    return <MarketingHeader session={session} />;
  }

  if (session.status !== "user") {
    return <AppGuestChrome session={session} />;
  }

  return <FloatingProfile user={session.user} />;
}
