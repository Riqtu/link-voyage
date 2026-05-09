"use client";

import { getAuthToken } from "@/lib/auth-token";
import { registerWebSession } from "@/lib/web-session-sync";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Если в браузере остался только токен в localStorage — выставляет httpOnly cookie
 * и отправляет на /trips (следующий заход на / уже обработает proxy).
 */
export function HomeAuthBridge() {
  const router = useRouter();

  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    void (async () => {
      await registerWebSession(token);
      router.replace("/trips");
    })();
  }, [router]);

  return null;
}
