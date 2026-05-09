"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import { cn } from "@/lib/utils";
import { Dialog } from "@base-ui/react/dialog";
import { FileText, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

type TripDocRow = Awaited<
  ReturnType<ReturnType<typeof getApiClient>["tripDoc"]["list"]["query"]>
>[number];

export default function TripDocumentsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [docs, setDocs] = useState<TripDocRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [addModalError, setAddModalError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const loadDocs = useCallback(async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const api = getApiClient();
      const result = await api.tripDoc.list.query({ tripId: id });
      setDocs(result);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Не удалось загрузить документы",
      );
    } finally {
      setIsLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  function resetAddForm() {
    setTitle("");
    setDescription("");
    setAddModalError(null);
    const input = fileInputRef.current;
    if (input) input.value = "";
  }

  function handleAddModalOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      resetAddForm();
    }
    setAddModalOpen(nextOpen);
  }

  async function submitNewDocument() {
    const fileInput = fileInputRef.current;
    const file = fileInput?.files?.[0];
    if (!file || file.size <= 0) {
      setAddModalError("Выберите файл для загрузки");
      return;
    }
    const trimmedTitle = title.trim();
    if (trimmedTitle.length < 2) {
      setAddModalError("Название: минимум 2 символа");
      return;
    }

    setUploadBusy(true);
    setAddModalError(null);
    try {
      const api = getApiClient();

      const signed = await api.s3.getSignedDocumentUploadUrl.mutate({
        tripId: id,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        size: file.size,
      });

      const put = await fetch(signed.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": signed.contentType,
        },
        body: file,
      });

      if (!put.ok) {
        throw new Error(
          `Ошибка загрузки в S3: ${put.status} ${put.statusText}`,
        );
      }

      await api.tripDoc.create.mutate({
        tripId: id,
        title: trimmedTitle,
        description: description.trim() || undefined,
        objectKey: signed.objectKey,
        originalFilename: file.name,
        contentType: signed.contentType,
      });

      resetAddForm();
      setAddModalOpen(false);
      await loadDocs();
    } catch (uploadError) {
      setAddModalError(
        uploadError instanceof Error
          ? uploadError.message
          : "Не удалось сохранить документ",
      );
    } finally {
      setUploadBusy(false);
    }
  }

  async function removeDoc(docId: string) {
    const confirmed = window.confirm("Удалить документ?");
    if (!confirmed) return;
    setDeletingId(docId);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripDoc.delete.mutate({ docId });
      await loadDocs();
      if (editingId === docId) {
        setEditingId(null);
      }
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Не удалось удалить документ",
      );
    } finally {
      setDeletingId(null);
    }
  }

  function beginEdit(item: TripDocRow) {
    setEditingId(item.id);
    setEditTitle(item.title);
    setEditDescription(item.description);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditTitle("");
    setEditDescription("");
  }

  async function saveEdit() {
    if (!editingId) return;
    const trimmed = editTitle.trim();
    if (trimmed.length < 2) {
      setError("Название: минимум 2 символа");
      return;
    }
    setEditSaving(true);
    setError(null);
    try {
      const api = getApiClient();
      await api.tripDoc.update.mutate({
        docId: editingId,
        title: trimmed,
        description: editDescription.trim() || undefined,
      });
      cancelEdit();
      await loadDocs();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить изменения",
      );
    } finally {
      setEditSaving(false);
    }
  }

  function docAcceptAttr() {
    return ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf";
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Документы поездки
        </h1>
        <Link
          className={cn(
            buttonVariants({ variant: "outline" }),
            "w-fit shrink-0 justify-center",
          )}
          href="/trips"
        >
          Все поездки
        </Link>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      <section className="mb-8 rounded-xl border bg-muted/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="rounded-lg border bg-muted/50 p-2">
              <FileText className="size-5 text-muted-foreground" aria-hidden />
            </span>
            <div>
              <h2 className="text-sm font-medium">Документы в облаке</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, Office и текст до 25&nbsp;MB. Файлы хранятся в S3, в группе
                видят все участники поездки.
              </p>
              {!isLoading ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  <span className="text-foreground">Всего:</span> {docs.length}
                </p>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="shrink-0 self-start sm:self-center"
            onClick={() => handleAddModalOpenChange(true)}
          >
            Добавить документ
          </Button>
        </div>
      </section>

      <Dialog.Root open={addModalOpen} onOpenChange={handleAddModalOpenChange}>
        <Dialog.Portal>
          <div className="fixed inset-0 z-[2100] flex items-center justify-center overflow-y-auto overscroll-y-contain px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
            <Dialog.Backdrop className="absolute inset-0 z-0 bg-black/55 backdrop-blur-[1px] transition-opacity data-[starting-style]:opacity-0 data-[ending-style]:opacity-0" />
            <Dialog.Popup className="relative z-10 my-6 w-[min(100vw-2rem,32rem)] max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-3rem))] overflow-y-auto rounded-2xl border bg-card p-6 shadow-xl outline-none">
              <Dialog.Title className="text-lg font-semibold tracking-tight">
                Новый документ
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-muted-foreground">
                После сохранения появится карточка со ссылкой для просмотра или
                скачивания.
              </Dialog.Description>

              {addModalError ? (
                <p className="mt-3 text-sm text-destructive">{addModalError}</p>
              ) : null}

              <form
                className="mt-4 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitNewDocument();
                }}
              >
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Название</span>
                  <input
                    autoFocus
                    minLength={2}
                    maxLength={160}
                    className="rounded-lg border bg-background px-3 py-2 text-sm"
                    placeholder="Билеты, полис, договор…"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">
                    Описание (необязательно)
                  </span>
                  <textarea
                    maxLength={2000}
                    rows={3}
                    className="resize-y rounded-lg border bg-background px-3 py-2 text-sm"
                    placeholder="Кратко, что внутри и зачем нужна группе"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  <span className="text-muted-foreground">Файл</span>
                  <input
                    ref={fileInputRef}
                    type="file"
                    required
                    className="cursor-pointer rounded-lg border border-dashed bg-background px-3 py-4 text-sm file:cursor-pointer file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:text-primary-foreground"
                    accept={docAcceptAttr()}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      const f = event.target.files?.[0];
                      if (f && !title.trim()) {
                        const base = f.name.replace(/\.[^/.]+$/, "");
                        setTitle(base.replace(/_/g, " "));
                      }
                    }}
                  />
                </label>

                <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <Dialog.Close
                    type="button"
                    disabled={uploadBusy}
                    className={cn(
                      buttonVariants({ variant: "outline" }),
                      "w-full sm:w-auto",
                    )}
                  >
                    Отмена
                  </Dialog.Close>
                  <Button
                    type="submit"
                    disabled={uploadBusy}
                    className="w-full sm:w-auto"
                  >
                    {uploadBusy ? "Загружаем…" : "Загрузить и сохранить"}
                  </Button>
                </div>
              </form>
            </Dialog.Popup>
          </div>
        </Dialog.Portal>
      </Dialog.Root>

      <section>
        <h2 className="sr-only">Список документов</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Загружаем…</p>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Пока нет ни одного документа. Нажмите «Добавить документ» — файл
            загрузится в облако, здесь появится карточка.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
            {docs.map((item) => (
              <li
                key={item.id}
                className="flex flex-col rounded-2xl border bg-card p-5 shadow-sm"
              >
                {editingId === item.id ? (
                  <>
                    <input
                      className="mb-2 rounded-lg border bg-background px-3 py-2 text-base font-semibold"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                    <textarea
                      className="mb-4 min-h-20 resize-y rounded-lg border bg-background px-3 py-2 text-sm"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                    <div className="mt-auto flex flex-wrap gap-2">
                      <Button
                        disabled={editSaving}
                        size="sm"
                        onClick={() => void saveEdit()}
                      >
                        Сохранить
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={cancelEdit}
                      >
                        Отмена
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-3 flex gap-3">
                      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-primary/10 text-primary">
                        <FileText className="size-6" aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <p className="text-lg font-semibold leading-tight">
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.filename}
                        </p>
                      </div>
                    </div>
                    {item.description ? (
                      <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>
                    ) : (
                      <p className="mb-4 text-xs italic text-muted-foreground">
                        Описание не указано.
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-4">
                      <a
                        className={cn(
                          buttonVariants({ variant: "default" }),
                          "inline-flex shrink-0",
                        )}
                        href={item.fileUrl}
                        download={item.filename}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Открыть документ
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => beginEdit(item)}
                      >
                        Изменить
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deletingId === item.id}
                        aria-label={`Удалить документ «${item.title}»`}
                        onClick={() => void removeDoc(item.id)}
                      >
                        <Trash2 className="size-4 sm:mr-1" aria-hidden />
                        <span className="hidden sm:inline">
                          {deletingId === item.id ? "Удаление…" : "Удалить"}
                        </span>
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
