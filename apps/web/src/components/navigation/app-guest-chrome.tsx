"use client";

import { buttonVariants } from "@/components/ui/button";
import type { AuthSessionState } from "@/hooks/use-auth-session";
import Link from "next/link";

type Props = {
  session: AuthSessionState;
};

export function AppGuestChrome({ session }: Props) {
  return (
    <div className="fixed top-[calc(10px+env(safe-area-inset-top))] right-[calc(12px+env(safe-area-inset-right))] z-[155]">
      {session.status === "loading" ? (
        <div
          className="h-10 w-24 animate-pulse rounded-full bg-muted shadow-sm"
          aria-hidden
        />
      ) : (
        <Link
          href="/auth"
          className={buttonVariants({ size: "sm", className: "shadow-md" })}
        >
          Войти
        </Link>
      )}
    </div>
  );
}
