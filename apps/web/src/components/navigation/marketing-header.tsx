"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import type { AuthSessionState } from "@/hooks/use-auth-session";
import { clearAuthToken } from "@/lib/auth-token";
import type { AuthUserProfile } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ChevronDown, MapPinned, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ProfileMenuDropdown } from "./profile-menu-dropdown";

function NavLink({
  href,
  children,
  active,
}: {
  href: string;
  children: ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
        active
          ? "bg-muted text-foreground"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function MarketingProfileChip({ user }: { user: AuthUserProfile }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const logout = useCallback(() => {
    clearAuthToken();
    router.refresh();
  }, [router]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: PointerEvent) {
      const el = ref.current;
      if (el && !el.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        variant="outline"
        size="default"
        className="!h-auto min-h-9 max-w-[200px] gap-2 px-2 py-1 sm:max-w-[240px]"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        {user.avatarUrl ? (
          <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
            {/* eslint-disable-next-line @next/next/no-img-element -- URL из S3 */}
            <img
              src={user.avatarUrl}
              alt=""
              className="absolute inset-0 block size-full object-cover"
              referrerPolicy="no-referrer"
              decoding="async"
            />
          </span>
        ) : (
          <User className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 truncate text-sm">{user.name}</span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-180 motion-reduce:rotate-0",
          )}
          aria-hidden
        />
      </Button>
      {open ? (
        <div className="absolute top-full right-0 z-[200] mt-1.5">
          <ProfileMenuDropdown
            user={user}
            onClose={() => setOpen(false)}
            onLogout={logout}
          />
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  session: AuthSessionState;
};

export function MarketingHeader({ session }: Props) {
  const pathname = usePathname();
  const brandHref = session.status === "user" ? "/trips" : "/";

  const homeActive = pathname === "/";
  const tripsActive = pathname === "/trips" || pathname.startsWith("/trips/");

  return (
    <header className="sticky top-0 z-[140] border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:gap-4 sm:px-6">
        <Link
          href={brandHref}
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-foreground"
        >
          <MapPinned className="size-5 text-muted-foreground" aria-hidden />
          <span className="hidden sm:inline">Link Voyage</span>
        </Link>

        <nav
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto sm:gap-2"
          aria-label="Основное меню"
        >
          {session.status !== "user" ? (
            <NavLink href="/" active={homeActive}>
              Главная
            </NavLink>
          ) : null}
          <NavLink href="/trips" active={tripsActive}>
            Поездки
          </NavLink>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5">
          {session.status !== "user" ? <ThemeToggle /> : null}
          {session.status === "loading" ? (
            <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
          ) : session.status === "guest" ? (
            <Link
              href="/auth"
              className={buttonVariants({ variant: "default", size: "sm" })}
            >
              Войти
            </Link>
          ) : (
            <MarketingProfileChip user={session.user} />
          )}
        </div>
      </div>
    </header>
  );
}
