"use client";

import { Button } from "@/components/ui/button";
import { clearAuthToken } from "@/lib/auth-token";
import type { AuthUserProfile } from "@/lib/trpc";
import { User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ProfileMenuDropdown } from "./profile-menu-dropdown";

type Props = {
  user: AuthUserProfile;
};

export function FloatingProfile({ user }: Props) {
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const logout = useCallback(() => {
    clearAuthToken();
    router.refresh();
  }, [router]);

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

  return (
    <div
      className="fixed top-[calc(10px+env(safe-area-inset-top))] right-[calc(12px+env(safe-area-inset-right))] z-[160]"
      ref={profileRef}
    >
      <Button
        type="button"
        variant="outline"
        size="default"
        className="relative h-auto min-h-10 gap-0 rounded-full border-border/90 bg-background/85 px-1 py-1 shadow-md backdrop-blur-md"
        aria-expanded={profileOpen}
        aria-haspopup="menu"
        aria-label="Меню профиля"
        onClick={() => setProfileOpen((open) => !open)}
      >
        {user.avatarUrl ? (
          <span className="relative mx-px size-8 shrink-0 overflow-hidden rounded-full bg-muted shadow-sm ring-1 ring-border/60">
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
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted/80 ring-1 ring-border/60">
            <User className="size-4 text-muted-foreground" />
          </span>
        )}
      </Button>
      {profileOpen ? (
        <div className="absolute top-full right-0 z-[161] mt-2">
          <ProfileMenuDropdown
            user={user}
            onClose={() => setProfileOpen(false)}
            onLogout={logout}
          />
        </div>
      ) : null}
    </div>
  );
}
