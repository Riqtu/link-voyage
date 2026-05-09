"use client";

import { getApiClient } from "@/lib/api-client";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
import type { AuthUserProfile } from "@/lib/trpc";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export type AuthSessionState =
  | { status: "loading" }
  | { status: "guest" }
  | { status: "user"; user: AuthUserProfile };

export function useAuthSession() {
  const pathname = usePathname();
  const [session, setSession] = useState<AuthSessionState>({
    status: "loading",
  });

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

  return { session, loadSession };
}
