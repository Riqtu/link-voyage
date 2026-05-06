"use client";

import { useTheme, type ThemeSetting } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
import type { AuthUserProfile } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronDown,
  LogOut,
  MapPinned,
  Monitor,
  Moon,
  Settings,
  Shield,
  Sun,
  User,
} from "lucide-react";
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
  | { status: "user"; user: AuthUserProfile };

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
  const { theme, setTheme } = useTheme();
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const themeChoices: {
    id: ThemeSetting;
    label: string;
    icon: typeof Sun;
  }[] = [
    { id: "light", label: "Светлая", icon: Sun },
    { id: "dark", label: "Тёмная", icon: Moon },
    { id: "system", label: "Как в системе", icon: Monitor },
  ];

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
    const onRefresh = () => {
      loadSession();
    };
    window.addEventListener("lv:session-refresh", onRefresh);
    return () => window.removeEventListener("lv:session-refresh", onRefresh);
  }, [loadSession]);

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
  const adminActive =
    pathname === "/admin/users" || pathname.startsWith("/admin/");

  return (
    <header className="sticky top-0 z-[100] border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur-md">
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
          {session.status === "user" && session.user.systemRole === "admin" ? (
            <NavLink href="/admin/users" active={adminActive}>
              <span className="inline-flex items-center gap-1.5">
                <Shield className="size-3.5 text-primary" aria-hidden />
                Админка
              </span>
            </NavLink>
          ) : null}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {session.status !== "user" ? <ThemeToggle /> : null}
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
                size="default"
                className="!h-auto min-h-9 max-w-[240px] gap-2 overflow-visible px-2 py-1.5"
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                onClick={() => setProfileOpen((open) => !open)}
              >
                {session.user.avatarUrl ? (
                  <span className="relative size-7 shrink-0 overflow-hidden rounded-full bg-muted shadow-sm ring-1 ring-border/60">
                    {/* eslint-disable-next-line @next/next/no-img-element -- URL из S3 */}
                    <img
                      src={session.user.avatarUrl}
                      alt=""
                      className="absolute inset-0 block size-full object-cover"
                      referrerPolicy="no-referrer"
                      decoding="async"
                    />
                  </span>
                ) : (
                  <User className="size-3.5 shrink-0 text-muted-foreground" />
                )}
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
                  <Link
                    href="/profile"
                    role="menuitem"
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                    onClick={() => setProfileOpen(false)}
                  >
                    <Settings className="size-4 text-muted-foreground" />
                    Настройки профиля
                  </Link>

                  <div
                    role="group"
                    aria-label="Тема оформления"
                    className="border-t border-border py-2"
                  >
                    <p className="mb-1.5 px-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Тема
                    </p>
                    <div className="space-y-0.5 px-1">
                      {themeChoices.map((choice) => {
                        const Icon = choice.icon;
                        const active = theme === choice.id;
                        return (
                          <button
                            key={choice.id}
                            type="button"
                            role="menuitemradio"
                            aria-checked={active}
                            className={cn(
                              "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted",
                              active &&
                                "bg-muted/70 font-medium text-foreground",
                            )}
                            onClick={() => setTheme(choice.id)}
                          >
                            <Icon
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {choice.label}
                            </span>
                            {active ? (
                              <Check
                                className="size-4 shrink-0 text-primary"
                                aria-hidden
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
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
