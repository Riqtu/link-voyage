"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
import { cn } from "@/lib/utils";
import { ChevronDown, LogOut, MapPinned, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type SessionState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "user"; user: { id: string; email: string; name: string } };

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

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const loadSession = useCallback(() => {
    const token = getAuthToken();
    if (!token) {
      setSession({ status: "guest" });
      return;
    }
    setSession({ status: "loading" });
    void getApiClient()
      .auth.me.query()
      .then((user) => setSession({ status: "user", user }))
      .catch(() => {
        clearAuthToken();
        setSession({ status: "guest" });
      });
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession, pathname]);

  useEffect(() => {
    if (!profileOpen) return;
    function handlePointerDown(event: PointerEvent) {
      const el = profileRef.current;
      if (el && !el.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKey);
    };
  }, [profileOpen]);

  function logout() {
    clearAuthToken();
    setSession({ status: "guest" });
    setProfileOpen(false);
    router.refresh();
  }

  const homeActive = pathname === "/";
  const tripsActive = pathname === "/trips" || pathname.startsWith("/trips/");

  return (
    <header className="sticky top-0 z-[100] border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-foreground"
        >
          <MapPinned className="size-5 text-muted-foreground" aria-hidden />
          <span className="hidden sm:inline">Link Voyage</span>
        </Link>

        <nav
          className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2"
          aria-label="Основное меню"
        >
          <NavLink href="/" active={homeActive}>
            Главная
          </NavLink>
          <NavLink href="/trips" active={tripsActive}>
            Поездки
          </NavLink>
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          {session.status === "loading" ? (
            <div
              className="h-8 w-20 animate-pulse rounded-md bg-muted"
              aria-hidden
            />
          ) : session.status === "guest" ? (
            <Link
              className={buttonVariants({ variant: "default", size: "sm" })}
              href="/auth"
            >
              Войти
            </Link>
          ) : (
            <div className="relative" ref={profileRef}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="max-w-[200px] gap-1.5 pl-2 pr-1.5"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                onClick={() => setProfileOpen((open) => !open)}
              >
                <User className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate">{session.user.name}</span>
                <ChevronDown
                  className={cn(
                    "size-3.5 shrink-0 text-muted-foreground transition-transform",
                    profileOpen && "rotate-180",
                  )}
                />
              </Button>
              {profileOpen ? (
                <div
                  className="absolute right-0 mt-1.5 w-60 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
                  role="menu"
                >
                  <div className="border-b border-border px-3 py-2">
                    <p className="truncate text-sm font-medium">
                      {session.user.name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {session.user.email}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                    onClick={() => {
                      logout();
                    }}
                  >
                    <LogOut className="size-4 text-muted-foreground" />
                    Выйти
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
