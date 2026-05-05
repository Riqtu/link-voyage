"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinByInvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function joinTrip() {
    if (!getAuthToken()) {
      router.push("/auth");
      return;
    }

    setError(null);
    setMessage(null);
    setIsLoading(true);
    try {
      const api = getApiClient();
      const result = await api.trip.acceptInvite.mutate({ code });
      setMessage(`Вы присоединились к поездке "${result.title}"`);
      router.push(`/trips/${result.tripId}`);
    } catch (joinError) {
      setError(
        joinError instanceof Error
          ? joinError.message
          : "Не удалось принять приглашение",
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Приглашение в поездку</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Код приглашения: <span className="font-mono">{code}</span>
        </p>

        {message ? (
          <p className="mt-4 text-sm text-green-600">{message}</p>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-destructive">{error}</p>
        ) : null}

        <div className="mt-5 flex gap-2">
          <Button onClick={joinTrip} disabled={isLoading}>
            {isLoading ? "Подключаем..." : "Присоединиться"}
          </Button>
          <Link
            className={buttonVariants({ variant: "outline" })}
            href="/trips"
          >
            К поездкам
          </Link>
        </div>
      </div>
    </main>
  );
}
