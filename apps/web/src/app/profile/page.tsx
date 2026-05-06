"use client";

import { Button } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
import type { AuthUserProfile } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  FormEvent,
  useCallback,
  useEffect,
  useState,
} from "react";

function notifySessionRefresh() {
  window.dispatchEvent(new CustomEvent("lv:session-refresh"));
}

export default function ProfilePage() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState<AuthUserProfile | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordRepeat, setNewPasswordRepeat] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileOk, setProfileOk] = useState<string | null>(null);
  const [passwordOk, setPasswordOk] = useState<string | null>(null);

  const applyProfileToForm = useCallback((p: AuthUserProfile) => {
    setProfile(p);
    setFirstName(p.name);
    setLastName(p.lastName);
    setAvatarDraftUrl(p.avatarUrl);
  }, []);

  useEffect(() => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }

    void (async () => {
      try {
        const api = getApiClient();
        const me = await api.auth.me.query();
        applyProfileToForm(me);
      } catch {
        clearAuthToken();
        router.replace("/auth");
      } finally {
        setLoaded(true);
      }
    })();
  }, [router, applyProfileToForm]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setProfileOk(null);
    const n = firstName.trim();
    if (n.length === 0) {
      setError("Укажите имя");
      return;
    }
    setProfileSaving(true);
    try {
      const api = getApiClient();
      const next = await api.auth.updateProfile.mutate({
        name: n,
        lastName: lastName.trim(),
      });
      applyProfileToForm(next);
      setProfileOk("Профиль сохранён");
      notifySessionRefresh();
      window.setTimeout(() => setProfileOk(null), 3500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сохранить профиль",
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function uploadAvatar(files: FileList | null) {
    if (!files?.length || !profile) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setError("Нужен файл изображения");
      return;
    }
    setAvatarBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      const signed = await api.s3.getSignedAvatarUploadUrl.mutate({
        filename: file.name,
        contentType: file.type || "image/jpeg",
        size: file.size,
      });
      const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "image/jpeg" },
        body: file,
      });
      if (!put.ok) {
        throw new Error(`Ошибка загрузки: ${put.status}`);
      }
      const next = await api.auth.updateProfile.mutate({
        name: profile.name,
        lastName: profile.lastName ?? "",
        avatarUrl: signed.publicUrl,
      });
      applyProfileToForm(next);
      notifySessionRefresh();
      setProfileOk("Фото обновлено");
      window.setTimeout(() => setProfileOk(null), 3500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось загрузить аватар",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (!profile) return;
    setAvatarBusy(true);
    setError(null);
    try {
      const api = getApiClient();
      const next = await api.auth.updateProfile.mutate({
        name: profile.name,
        lastName: profile.lastName ?? "",
        avatarUrl: null,
      });
      applyProfileToForm(next);
      notifySessionRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось убрать фото");
    } finally {
      setAvatarBusy(false);
    }
  }

  async function changePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setPasswordOk(null);
    if (newPassword !== newPasswordRepeat) {
      setError("Новые пароли не совпадают");
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 72) {
      setError("Новый пароль: от 8 до 72 символов");
      return;
    }
    setPasswordBusy(true);
    try {
      const api = getApiClient();
      await api.auth.changePassword.mutate({
        currentPassword,
        newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setNewPasswordRepeat("");
      setPasswordOk("Пароль обновлён");
      window.setTimeout(() => setPasswordOk(null), 3500);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Не удалось сменить пароль",
      );
    } finally {
      setPasswordBusy(false);
    }
  }

  if (!loaded || !profile) {
    return (
      <main className="mx-auto min-h-screen w-full max-w-lg px-6 py-10">
        <p className="text-sm text-muted-foreground">Загружаем профиль…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-lg px-6 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Настройки профиля
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{profile.email}</p>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {profileOk ? (
        <p className="mb-4 text-sm text-green-700 dark:text-green-400">
          {profileOk}
        </p>
      ) : null}

      <form
        onSubmit={saveProfile}
        className="space-y-5 rounded-2xl border bg-card p-5 shadow-sm"
      >
        <h2 className="text-sm font-medium">Профиль</h2>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="relative size-20 shrink-0 overflow-hidden rounded-full border bg-muted">
            {avatarDraftUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- произвольный URL из S3
              <img
                src={avatarDraftUrl}
                alt=""
                className="size-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                Нет фото
              </div>
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <input
              type="file"
              accept="image/*"
              className="text-sm"
              disabled={avatarBusy}
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                void uploadAvatar(e.target.files);
                e.target.value = "";
              }}
            />
            {avatarDraftUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-fit gap-1.5"
                disabled={avatarBusy}
                onClick={() => void removeAvatar()}
              >
                <Trash2 className="size-3.5" aria-hidden />
                Убрать фото
              </Button>
            ) : null}
            <p className="text-xs text-muted-foreground">
              До 10 МБ: JPG, PNG, WebP, GIF. Файл хранится в хранилище проекта.
            </p>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="pf-name">
            Имя
          </label>
          <input
            id="pf-name"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            maxLength={80}
            autoComplete="given-name"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="pf-last">
            Фамилия
          </label>
          <input
            id="pf-last"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            maxLength={80}
            autoComplete="family-name"
          />
        </div>

        <Button type="submit" disabled={profileSaving || avatarBusy}>
          {profileSaving ? "Сохранение…" : "Сохранить профиль"}
        </Button>
      </form>

      <form
        onSubmit={changePasswordSubmit}
        className={cn(
          "mt-6 space-y-4 rounded-2xl border bg-card p-5 shadow-sm",
        )}
      >
        <h2 className="text-sm font-medium">Смена пароля</h2>
        {passwordOk ? (
          <p className="text-sm text-green-700 dark:text-green-400">
            {passwordOk}
          </p>
        ) : null}
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="pf-cur-pw">
            Текущий пароль
          </label>
          <input
            id="pf-cur-pw"
            type="password"
            autoComplete="current-password"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="pf-new-pw">
            Новый пароль
          </label>
          <input
            id="pf-new-pw"
            type="password"
            autoComplete="new-password"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            maxLength={72}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="pf-new-pw2">
            Повтор нового пароля
          </label>
          <input
            id="pf-new-pw2"
            type="password"
            autoComplete="new-password"
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
            value={newPasswordRepeat}
            onChange={(e) => setNewPasswordRepeat(e.target.value)}
            required
            minLength={8}
            maxLength={72}
          />
        </div>
        <Button type="submit" disabled={passwordBusy}>
          {passwordBusy ? "Сохранение…" : "Обновить пароль"}
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-muted-foreground">
        <Link href="/trips" className="font-medium text-foreground underline">
          К поездкам
        </Link>
      </p>
    </main>
  );
}
