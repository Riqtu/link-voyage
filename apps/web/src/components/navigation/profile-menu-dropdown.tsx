"use client";

import { useTheme } from "@/components/theme-provider";
import type { AuthUserProfile } from "@/lib/trpc";
import { LogOut, Moon, Settings, Shield, Sun } from "lucide-react";
import Link from "next/link";

type Props = {
  user: AuthUserProfile;
  onClose: () => void;
  onLogout: () => void;
};

export function ProfileMenuDropdown({ user, onClose, onLogout }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div
      className="w-60 rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
      role="menu"
    >
      <div className="border-b border-border px-3 py-2">
        <p className="truncate text-sm font-medium">{user.name}</p>
        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
      </div>
      <Link
        href="/profile"
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
        onClick={onClose}
      >
        <Settings className="size-4 text-muted-foreground" />
        Настройки профиля
      </Link>

      {user.systemRole === "admin" ? (
        <Link
          href="/admin/users"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
          onClick={onClose}
        >
          <Shield className="size-4 shrink-0 text-primary" aria-hidden />
          Админка
        </Link>
      ) : null}

      <div className="border-t border-border py-2">
        <button
          type="button"
          role="menuitem"
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
          aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          {isDark ? (
            <Sun
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          ) : (
            <Moon
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
          )}
          {isDark ? "Светлая тема" : "Тёмная тема"}
        </button>
      </div>

      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
        onClick={() => {
          onLogout();
          onClose();
        }}
      >
        <LogOut className="size-4 text-muted-foreground" />
        Выйти
      </button>
    </div>
  );
}
