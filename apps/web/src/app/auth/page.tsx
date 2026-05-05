"use client";

import { Button } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { setAuthToken } from "@/lib/auth-token";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

type Mode = "login" | "register";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const api = getApiClient();
      const response =
        mode === "register"
          ? await api.auth.register.mutate({ name, email, password })
          : await api.auth.login.mutate({ email, password });

      setAuthToken(response.token);
      router.push("/trips");
    } catch (submitError) {
      const fallback = "Не удалось выполнить авторизацию";
      if (submitError instanceof Error && submitError.message) {
        setError(submitError.message);
      } else {
        setError(fallback);
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border bg-card p-6 shadow-sm">
        <p className="text-sm text-muted-foreground">Link Voyage</p>
        <h1 className="mt-2 text-2xl font-semibold">
          {mode === "login" ? "Вход в аккаунт" : "Создание аккаунта"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Планируйте поездки с друзьями в одном пространстве.
        </p>

        <div className="mt-4 flex gap-2">
          <Button
            type="button"
            variant={mode === "login" ? "default" : "outline"}
            onClick={() => setMode("login")}
          >
            Вход
          </Button>
          <Button
            type="button"
            variant={mode === "register" ? "default" : "outline"}
            onClick={() => setMode("register")}
          >
            Регистрация
          </Button>
        </div>

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          {mode === "register" ? (
            <input
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
              placeholder="Имя"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
            />
          ) : null}
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <input
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
            placeholder="Пароль (минимум 8 символов)"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={8}
          />

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button className="w-full" type="submit" disabled={isLoading}>
            {isLoading
              ? "Загрузка..."
              : mode === "login"
                ? "Войти"
                : "Создать аккаунт"}
          </Button>
        </form>

        <Link
          href="/"
          className="mt-4 inline-block text-sm text-muted-foreground"
        >
          На главную
        </Link>
      </div>
    </main>
  );
}
