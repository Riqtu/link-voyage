"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { clearAuthToken, getAuthToken } from "@/lib/auth-token";
import type { AuthUserProfile } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Dialog } from "@base-ui/react/dialog";
import { ArrowLeft, Pencil, Trash2, User, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useId,
  useState,
  type ChangeEvent,
} from "react";

type AdminUserRow = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["admin"]["listUsers"]["query"]>
>["users"][number];

function notifySessionRefresh() {
  window.dispatchEvent(new CustomEvent("lv:session-refresh"));
}

export default function AdminUsersPage() {
  const router = useRouter();
  const formId = useId();
  const [gate, setGate] = useState<"loading" | "ok" | "denied">("loading");
  const [viewer, setViewer] = useState<AuthUserProfile | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [editRow, setEditRow] = useState<AdminUserRow | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const reloadUsers = useCallback(async () => {
    try {
      const api = getApiClient();
      const data = await api.admin.listUsers.query();
      setUsers(data.users);
      setListError(null);
    } catch (e) {
      setListError(
        e instanceof Error ? e.message : "Не удалось загрузить пользователей",
      );
    }
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
        setViewer(me);
        if (me.systemRole !== "admin") {
          setGate("denied");
          return;
        }
        setGate("ok");
        await reloadUsers();
      } catch {
        clearAuthToken();
        router.replace("/auth");
      }
    })();
  }, [router, reloadUsers]);

  function openEdit(row: AdminUserRow) {
    setEditRow(row);
    setFirstName(row.name);
    setLastName(row.lastName);
    setAvatarDraftUrl(row.avatarUrl);
    setFormError(null);
    setSaveOk(null);
  }

  function closeEdit() {
    setEditRow(null);
    setFormError(null);
    setSaveOk(null);
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    const n = firstName.trim();
    if (n.length === 0) {
      setFormError("Укажите имя");
      return;
    }
    setSaveBusy(true);
    setFormError(null);
    setSaveOk(null);
    try {
      const api = getApiClient();
      const updated = await api.admin.updateUserProfile.mutate({
        userId: editRow.id,
        name: n,
        lastName: lastName.trim(),
      });
      setSaveOk("Сохранено");
      await reloadUsers();
      setEditRow((prev) =>
        prev && prev.id === updated.id ? { ...prev, ...updated } : prev,
      );
      if (viewer?.id === updated.id) {
        notifySessionRefresh();
      }
      window.setTimeout(() => setSaveOk(null), 2500);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Не удалось сохранить изменения",
      );
    } finally {
      setSaveBusy(false);
    }
  }

  async function uploadAvatarForEdit(files: FileList | null) {
    if (!files?.length || !editRow) return;
    const file = files[0];
    if (!file.type.startsWith("image/")) {
      setFormError("Нужен файл изображения");
      return;
    }
    setAvatarBusy(true);
    setFormError(null);
    try {
      const api = getApiClient();
      const signed = await api.admin.getSignedAvatarUploadUrlForUser.mutate({
        userId: editRow.id,
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
      const nameResolved =
        firstName.trim().length > 0 ? firstName.trim() : editRow.name;
      const updated = await api.admin.updateUserProfile.mutate({
        userId: editRow.id,
        name: nameResolved,
        lastName: lastName.trim(),
        avatarUrl: signed.publicUrl,
      });
      setAvatarDraftUrl(updated.avatarUrl);
      setFirstName(updated.name);
      setLastName(updated.lastName);
      await reloadUsers();
      if (viewer?.id === updated.id) {
        notifySessionRefresh();
      }
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Не удалось загрузить аватар",
      );
    } finally {
      setAvatarBusy(false);
    }
  }

  async function clearAvatarInForm() {
    if (!editRow) return;
    setAvatarDraftUrl(null);
    setFormError(null);
    const n =
      firstName.trim().length > 0 ? firstName.trim() : editRow.name.trim();
    if (n.length === 0) {
      setFormError("Сначала укажите имя пользователя");
      return;
    }
    setSaveBusy(true);
    try {
      const api = getApiClient();
      await api.admin.updateUserProfile.mutate({
        userId: editRow.id,
        name: n,
        lastName: lastName.trim(),
        avatarUrl: null,
      });
      setSaveOk("Аватар убран");
      await reloadUsers();
      if (viewer?.id === editRow.id) {
        notifySessionRefresh();
      }
      window.setTimeout(() => setSaveOk(null), 2500);
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Не удалось убрать аватар",
      );
    } finally {
      setSaveBusy(false);
    }
  }

  if (gate === "loading") {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 text-sm text-muted-foreground">
        Загрузка…
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-lg font-medium">Доступ запрещён</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Нужна системная роль администратора. Первого админа можно задать через
          переменную окружения{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">
            ADMIN_EMAILS
          </code>{" "}
          на API (email через запятую), затем войти в аккаунт заново.
        </p>
        <Link
          href="/trips"
          className={cn(buttonVariants({ variant: "default" }), "mt-6")}
        >
          К поездкам
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/trips"
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "inline-flex items-center gap-2",
          )}
        >
          <ArrowLeft className="size-4" aria-hidden />
          Поездки
        </Link>
        <h1 className="text-2xl font-medium tracking-tight">
          Админка — пользователи
        </h1>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Редактирование имени, фамилии и аватара. До 500 пользователей в списке.
      </p>

      {listError ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {listError}
        </p>
      ) : null}

      <ul className="divide-y divide-border rounded-xl border bg-card">
        {users.map((u) => (
          <li
            key={u.id}
            className="flex flex-wrap items-center gap-3 px-3 py-3 text-sm"
          >
            <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
              {u.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- URL из S3
                <img
                  src={u.avatarUrl}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="flex size-full items-center justify-center text-muted-foreground">
                  <User className="size-4" aria-hidden />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{u.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {u.email}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide",
                u.systemRole === "admin"
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border bg-muted/40 text-muted-foreground",
              )}
            >
              {u.systemRole === "admin" ? "Админ" : "Пользователь"}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => openEdit(u)}
            >
              <Pencil className="size-4 sm:mr-1" aria-hidden />
              <span className="hidden sm:inline">Править</span>
            </Button>
          </li>
        ))}
      </ul>

      <Dialog.Root
        open={editRow !== null}
        onOpenChange={(open) => {
          if (!open) closeEdit();
        }}
      >
        <Dialog.Portal>
          <div className="fixed inset-0 z-[2100] flex items-center justify-center overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Dialog.Backdrop className="absolute inset-0 z-0 bg-black/55 backdrop-blur-[1px] transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
            <Dialog.Popup className="relative z-10 my-6 w-[min(100vw-2rem,24rem)] max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-3rem))] overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl outline-none">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <Dialog.Title className="text-lg font-semibold tracking-tight">
                    Профиль пользователя
                  </Dialog.Title>
                  {editRow ? (
                    <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                      {editRow.email}
                    </Dialog.Description>
                  ) : null}
                </div>
                <Dialog.Close
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label="Закрыть"
                >
                  <X className="size-5" aria-hidden />
                </Dialog.Close>
              </div>

              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => void saveEdit(e)}
              >
                <div className="space-y-1">
                  <label
                    className="block text-xs text-muted-foreground"
                    htmlFor={`${formId}-name`}
                  >
                    Имя
                  </label>
                  <input
                    id={`${formId}-name`}
                    type="text"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    value={firstName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setFirstName(e.target.value)
                    }
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    className="block text-xs text-muted-foreground"
                    htmlFor={`${formId}-last`}
                  >
                    Фамилия
                  </label>
                  <input
                    id={`${formId}-last`}
                    type="text"
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm"
                    value={lastName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) =>
                      setLastName(e.target.value)
                    }
                    autoComplete="off"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Аватар</p>
                  <div className="flex items-center gap-3">
                    <div className="relative size-14 shrink-0 overflow-hidden rounded-full bg-muted ring-1 ring-border/60">
                      {avatarDraftUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatarDraftUrl}
                          alt=""
                          className="absolute inset-0 size-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex size-full items-center justify-center text-muted-foreground">
                          <User className="size-6" aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={avatarBusy || !editRow}
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = "image/*";
                          input.onchange = () =>
                            void uploadAvatarForEdit(input.files);
                          input.click();
                        }}
                      >
                        {avatarBusy ? "Загрузка…" : "Загрузить"}
                      </Button>
                      {avatarDraftUrl ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={saveBusy}
                          onClick={() => void clearAvatarInForm()}
                        >
                          <Trash2 className="size-4 sm:mr-1" aria-hidden />
                          <span className="hidden sm:inline">Убрать</span>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>

                {formError ? (
                  <p className="text-sm text-destructive" role="alert">
                    {formError}
                  </p>
                ) : null}
                {saveOk ? (
                  <p className="text-sm text-green-700 dark:text-green-400">
                    {saveOk}
                  </p>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <Dialog.Close
                    className={cn(
                      "inline-flex h-9 items-center justify-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted",
                    )}
                  >
                    Отмена
                  </Dialog.Close>
                  <Button type="submit" disabled={saveBusy}>
                    {saveBusy ? "Сохранение…" : "Сохранить"}
                  </Button>
                </div>
              </form>
            </Dialog.Popup>
          </div>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
