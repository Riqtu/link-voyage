"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { getApiClient } from "@/lib/api-client";
import { getAuthToken } from "@/lib/auth-token";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  FolderPlus,
  ListPlus,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  ChecklistDndList,
  LineOverflowMenu,
  SectionOverflowMenu,
  type ChecklistDndActions,
} from "./checklist-dnd-list";
import {
  buildVisiblePackRows,
  collectDescendantPackIds,
  sectionLineProgress,
  sectionLinesAllComplete,
  type PackItemView,
} from "./checklist-helpers";

type ChecklistRow = {
  id: string;
  kind: "line" | "group";
  title: string;
  done: boolean;
  sortOrder: number;
  parentItemId: string | null;
  quantity: number | null;
  quantityUnit: string | null;
};

const UNIT_QUICK = ["шт", "пар", "уп.", "компл"];

/** Однократная подсказка про личный чеклист и ввод снизу */
const CHECKLIST_PERSONAL_HINT_KEY = "lv-checklist-personal-hint-v1";

function collapseStorageKeyForTrip(tripId: string): string {
  return `lv-checklist-collapsed-${tripId}`;
}

type RestorePackOrdered = (
  | { kind: "group"; clientKey: string; title: string }
  | {
      kind: "line";
      clientKey: string;
      parentClientKey?: string;
      title: string;
      done?: boolean;
      quantity?: number | null;
      quantityUnit?: string | null;
    }
)[];

function buildRestorePayloadFromSnapshot(
  snapshot: PackItemView[],
): RestorePackOrdered {
  return snapshot.map((r) =>
    r.kind === "group"
      ? { kind: "group" as const, clientKey: r.id, title: r.title }
      : {
          kind: "line" as const,
          clientKey: r.id,
          ...(r.parentItemId ? { parentClientKey: r.parentItemId } : {}),
          title: r.title,
          done: r.done,
          ...(typeof r.quantity === "number"
            ? {
                quantity: r.quantity,
                quantityUnit: r.quantityUnit ?? null,
              }
            : {}),
        },
  );
}

/**
 * Если в названии в конце «— 5 шт» / « · 3 пары » — выделяем число и единицу.
 * Явные поля количества в форме важнее; срабатывает только без ввода числа там.
 */
function parseTitleTrailingQty(raw: string): {
  cleanTitle: string;
  quantity?: number;
  quantityUnit?: string;
} {
  const full = raw.trim();
  const patterns = [
    /^([\s\S]{1,400}?)[\u00a0\s]+[—–·][\u00a0\s]*(\d{1,5})(?:[\u00a0\s]+(шт\.?|пар(?:ы|а)?\.?|уп\.?|компл\.?))?[\s\u00a0]*$/iu,
    /^([\s\S]{1,400}?)[\u00a0\s]+[\-–][\u00a0\s]+(\d{1,5})(?:[\u00a0\s]+(шт\.?|пар(?:ы|а)?\.?|уп\.?|компл\.?))?[\s\u00a0]*$/iu,
  ];
  for (const pattern of patterns) {
    const m = pattern.exec(full);
    if (!m) continue;
    const titlePart = (m[1] ?? "").trim();
    const n = Number.parseInt((m[2] ?? "").trim(), 10);
    if (titlePart.length < 1) continue;
    if (!Number.isFinite(n) || n < 1 || n > 99999) continue;
    const rawU = (m[3] ?? "").replace(/\./g, "").trim().toLowerCase();
    let unit: string | undefined;
    if (rawU.startsWith("пар")) unit = "пар";
    else if (rawU.startsWith("шт")) unit = "шт";
    else if (rawU.startsWith("уп")) unit = "уп.";
    else if (rawU.startsWith("компл")) unit = "компл";

    const quantityUnit =
      unit && unit.length > 0 && unit.length <= 12 ? unit : undefined;

    return { cleanTitle: titlePart, quantity: n, quantityUnit };
  }
  return { cleanTitle: full };
}

function qtyLabel(row: ChecklistRow): string | null {
  if (row.kind !== "line" || row.quantity == null) return null;
  const u = row.quantityUnit?.trim();
  return u ? `${row.quantity}\u00a0${u}` : `${row.quantity}`;
}

function parseQty(raw: string): number | undefined {
  const t = raw.trim();
  if (t === "") return undefined;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) && n >= 1 && n <= 99999 ? n : undefined;
}

function focusComposerTitle(input: HTMLInputElement | null) {
  if (!input) return;
  queueMicrotask(() => input.focus({ preventScroll: true }));
}

export default function TripPackChecklistPage() {
  const { id: tripId } = useParams<{ id: string }>();
  const router = useRouter();
  const newTitleRef = useRef<HTMLInputElement>(null);
  /** Зона нижней панели — клик вне её снимает режим «добавить в секцию» */
  const composerShellRef = useRef<HTMLDivElement>(null);
  const [tripTitle, setTripTitle] = useState<string | null>(null);
  const [items, setItems] = useState<ChecklistRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState<"line" | "group">("line");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [adding, setAdding] = useState(false);
  /** Добавляем строку только внутри этой секции (kind=group) */
  const [pendingParentSectionId, setPendingParentSectionId] = useState<
    string | null
  >(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraftTitle, setEditDraftTitle] = useState("");
  const [editDraftQty, setEditDraftQty] = useState("");
  const [editDraftUnit, setEditDraftUnit] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [removingId, setRemovingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [resettingPreset, setResettingPreset] = useState(false);

  /** Тип строки и количество — в компактном выезде над полем ввода */
  const [composerExtrasOpen, setComposerExtrasOpen] = useState(false);
  /** Краткая подсветка поля названия после «Строка» у секции */
  const [composerGlow, setComposerGlow] = useState(false);

  /** После монтирования читаем localStorage один раз — без моргания */
  const [hintResolved, setHintResolved] = useState(false);
  /** Одноразовая памятка про личный чеклист */
  const [personalHintVisible, setPersonalHintVisible] = useState(false);
  /** Дубликат строки */
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const [filterQuery, setFilterQuery] = useState("");
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(
    () => {
      try {
        if (typeof window === "undefined") return new Set();
        const raw = window.localStorage.getItem(
          collapseStorageKeyForTrip(tripId),
        );
        if (!raw) return new Set();
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(
          parsed.filter((x): x is string => typeof x === "string"),
        );
      } catch {
        return new Set();
      }
    },
  );
  /** Снимок последнего удаления для восстановления */
  const [undoDeleteSnapshot, setUndoDeleteSnapshot] = useState<
    PackItemView[] | null
  >(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [bulkWorking, setBulkWorking] = useState<
    | null
    | "all_on"
    | "all_off"
    | `section:${string}:on`
    | `section:${string}:off`
  >(null);

  const filterNorm = filterQuery.trim().toLowerCase();
  const filtering = filterNorm.length > 0;

  const collapseKey = useMemo(
    () => collapseStorageKeyForTrip(tripId),
    [tripId],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(
        collapseKey,
        JSON.stringify([...collapsedSectionIds]),
      );
    } catch {
      /* ignore quota */
    }
  }, [collapseKey, collapsedSectionIds]);

  useEffect(() => {
    if (!undoDeleteSnapshot) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setUndoDeleteSnapshot(null);
      undoTimerRef.current = null;
    }, 8200);
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, [undoDeleteSnapshot]);

  function toggleSectionCollapsed(sectionId: string) {
    setCollapsedSectionIds((prev) => {
      const n = new Set(prev);
      if (n.has(sectionId)) n.delete(sectionId);
      else n.add(sectionId);
      return n;
    });
  }

  const visibleRows = useMemo(
    () =>
      buildVisiblePackRows(items as PackItemView[], {
        collapsedSectionIds,
        filterNorm,
      }),
    [items, collapsedSectionIds, filterNorm],
  );

  const lineRows = useMemo(
    () => items.filter((i) => i.kind === "line"),
    [items],
  );

  const lineCountBySectionId = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.kind !== "line" || !item.parentItemId) continue;
      map.set(item.parentItemId, (map.get(item.parentItemId) ?? 0) + 1);
    }
    return map;
  }, [items]);

  const load = useCallback(async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    setIsLoading(true);
    setLoadError(null);
    try {
      const api = getApiClient();
      const [trip, checklist] = await Promise.all([
        api.trip.byId.query({ tripId }),
        api.trip.packChecklist.list.query({ tripId }),
      ]);
      setTripTitle(trip.title);
      setItems(checklist.items);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось загрузить чеклист",
      );
    } finally {
      setIsLoading(false);
    }
  }, [router, tripId]);

  /** После мутаций — без isLoading, чтобы список не исчезал и не было «полного» ререндера */
  const refreshChecklist = useCallback(async () => {
    if (!getAuthToken()) {
      router.replace("/auth");
      return;
    }
    setLoadError(null);
    try {
      const api = getApiClient();
      const checklist = await api.trip.packChecklist.list.query({ tripId });
      setItems(checklist.items);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось обновить список",
      );
    }
  }, [router, tripId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      setPersonalHintVisible(
        typeof window !== "undefined" &&
          window.localStorage.getItem(CHECKLIST_PERSONAL_HINT_KEY) !== "1",
      );
    } catch {
      setPersonalHintVisible(false);
    } finally {
      setHintResolved(true);
    }
  }, []);

  useEffect(() => {
    if (!composerGlow) return;
    const tid = window.setTimeout(() => setComposerGlow(false), 2200);
    return () => window.clearTimeout(tid);
  }, [composerGlow]);

  /** Клик вне нижней панели выключает бейдж «в секцию» (не только × в форме). */
  useEffect(() => {
    if (!pendingParentSectionId) return;
    const onPointerDown = (e: PointerEvent) => {
      const shell = composerShellRef.current;
      const t = e.target;
      if (t instanceof Node && shell?.contains(t)) return;
      setPendingParentSectionId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [pendingParentSectionId]);

  useEffect(() => {
    if (!composerExtrasOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setComposerExtrasOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [composerExtrasOpen]);

  async function onAddRoot(e: FormEvent) {
    e.preventDefault();
    let titleSubmit = newTitle.trim();
    if (titleSubmit.length < 1) return;

    const explicitQty = parseQty(newQty);
    let qtyFromExtras = explicitQty;
    let unitTrim = newUnit.trim();

    const kind = pendingParentSectionId ? "line" : newKind;

    if (kind === "line" && explicitQty == null && newQty.trim()) {
      setLoadError(
        "В количестве укажите целое число от 1 до 99999 или оставьте пустым",
      );
      return;
    }
    if (kind === "group" && (explicitQty != null || newQty.trim())) {
      setLoadError("У секции не задают количество");
      return;
    }

    if (kind === "line" && explicitQty == null && !newQty.trim()) {
      const parsedTitle = parseTitleTrailingQty(titleSubmit);
      if (parsedTitle.quantity != null) {
        titleSubmit = parsedTitle.cleanTitle;
        if (titleSubmit.length < 1) {
          setLoadError("После числа нужен текст названия перед разделителем");
          return;
        }
        qtyFromExtras = parsedTitle.quantity;
        if (
          parsedTitle.quantityUnit &&
          parsedTitle.quantityUnit.length > 0 &&
          unitTrim.length === 0
        ) {
          unitTrim = parsedTitle.quantityUnit;
        }
      }
    }

    setAdding(true);
    setLoadError(null);
    try {
      const api = getApiClient();
      await api.trip.packChecklist.addItem.mutate({
        tripId,
        title: titleSubmit,
        kind,
        ...(pendingParentSectionId
          ? { parentItemId: pendingParentSectionId }
          : {}),
        ...(kind === "line" && qtyFromExtras != null
          ? { quantity: qtyFromExtras }
          : {}),
        ...(kind === "line" && qtyFromExtras != null && unitTrim.length > 0
          ? { quantityUnit: unitTrim }
          : {}),
      });
      setNewTitle("");
      setNewQty("");
      setNewUnit("");
      setPendingParentSectionId(null);
      setComposerExtrasOpen(false);
      await refreshChecklist();
      focusComposerTitle(newTitleRef.current);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не удалось добавить");
    } finally {
      setAdding(false);
    }
  }

  function dismissPersonalHint() {
    try {
      window.localStorage.setItem(CHECKLIST_PERSONAL_HINT_KEY, "1");
    } catch {
      /* ignore quota */
    }
    setPersonalHintVisible(false);
  }

  async function duplicateLine(row: ChecklistRow) {
    if (row.kind !== "line") return;
    setDuplicatingId(row.id);
    setLoadError(null);
    try {
      const api = getApiClient();
      await api.trip.packChecklist.addItem.mutate({
        tripId,
        title: row.title,
        kind: "line",
        ...(row.parentItemId ? { parentItemId: row.parentItemId } : {}),
        ...(row.quantity != null ? { quantity: row.quantity } : {}),
        ...(row.quantity != null &&
        row.quantityUnit &&
        row.quantityUnit.trim().length > 0
          ? { quantityUnit: row.quantityUnit.trim() }
          : {}),
      });
      await refreshChecklist();
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось скопировать пункт",
      );
    } finally {
      setDuplicatingId(null);
    }
  }

  async function toggleDone(row: ChecklistRow) {
    if (row.kind !== "line") return;
    const nextDone = !row.done;
    const rollback = items;
    setItems((cur) =>
      cur.map((i) => (i.id === row.id ? { ...i, done: nextDone } : i)),
    );
    setTogglingId(row.id);
    setLoadError(null);
    try {
      const api = getApiClient();
      await api.trip.packChecklist.updateItem.mutate({
        tripId,
        itemId: row.id,
        done: nextDone,
      });
    } catch (e) {
      setItems(rollback);
      setLoadError(
        e instanceof Error ? e.message : "Не удалось обновить пункт",
      );
    } finally {
      setTogglingId(null);
    }
  }

  function beginEdit(row: ChecklistRow) {
    setEditingId(row.id);
    setEditDraftTitle(row.title);
    setEditDraftQty(
      row.kind === "line" && row.quantity != null ? String(row.quantity) : "",
    );
    setEditDraftUnit(
      row.kind === "line" && row.quantityUnit ? row.quantityUnit : "",
    );
  }

  async function saveEdit() {
    if (!editingId) return;
    const row = items.find((i) => i.id === editingId);
    if (!row) return;
    const t = editDraftTitle.trim();
    if (t.length < 1) return;
    const qty = parseQty(editDraftQty);
    if (row.kind === "line" && editDraftQty.trim() && qty == null) {
      setLoadError("Неверное значение количества");
      return;
    }

    setEditSaving(true);
    setLoadError(null);
    try {
      const api = getApiClient();
      if (row.kind === "group") {
        await api.trip.packChecklist.updateItem.mutate({
          tripId,
          itemId: editingId,
          title: t,
        });
      } else {
        await api.trip.packChecklist.updateItem.mutate({
          tripId,
          itemId: editingId,
          title: t,
          quantity: qty ?? null,
          quantityUnit:
            qty != null && editDraftUnit.trim().length > 0
              ? editDraftUnit.trim()
              : null,
        });
      }
      setEditingId(null);
      await refreshChecklist();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не удалось сохранить");
    } finally {
      setEditSaving(false);
    }
  }

  async function resetFromPreset() {
    if (
      !window.confirm(
        "Текущий чеклист будет полностью заменён готовым шаблоном вещей в поездку. Все пункты и секции, которые есть сейчас, удалятся. Продолжить?",
      )
    ) {
      return;
    }
    setResettingPreset(true);
    setLoadError(null);
    try {
      const api = getApiClient();
      const { items: next } =
        await api.trip.packChecklist.resetFromPreset.mutate({ tripId });
      setItems(next);
      setPendingParentSectionId(null);
      setEditingId(null);
      setNewTitle("");
      setNewQty("");
      setNewUnit("");
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось обновить список",
      );
    } finally {
      setResettingPreset(false);
    }
  }

  async function removeRow(row: ChecklistRow) {
    const ids = collectDescendantPackIds(items as PackItemView[], row.id);
    const snapshot = items.filter((r) => ids.has(r.id)) as PackItemView[];
    setRemovingId(row.id);
    setUndoDeleteSnapshot(null);
    try {
      const api = getApiClient();
      await api.trip.packChecklist.removeItem.mutate({
        tripId,
        itemId: row.id,
      });
      if (pendingParentSectionId === row.id) setPendingParentSectionId(null);
      if (editingId === row.id) setEditingId(null);
      setCollapsedSectionIds((prev) => {
        const n = new Set(prev);
        for (const id of ids) n.delete(id);
        return n;
      });
      await refreshChecklist();
      setUndoDeleteSnapshot(snapshot.length > 0 ? snapshot : null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Не удалось удалить");
    } finally {
      setRemovingId(null);
    }
  }

  async function restoreDeletedSnapshot() {
    if (!undoDeleteSnapshot?.length) return;
    const ordered = buildRestorePayloadFromSnapshot(undoDeleteSnapshot);
    setLoadError(null);
    try {
      const api = getApiClient();
      const { items: next } =
        await api.trip.packChecklist.restoreDeletedItemsBatch.mutate({
          tripId,
          ordered,
        });
      setItems(next);
      setUndoDeleteSnapshot(null);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось вернуть пункты",
      );
    }
  }

  const reorderPeers = useCallback(
    async (parentSectionId: string | null, orderedItemIds: string[]) => {
      setLoadError(null);
      try {
        const api = getApiClient();
        const { items: next } =
          await api.trip.packChecklist.reorderPeers.mutate({
            tripId,
            parentSectionId: parentSectionId ?? null,
            orderedItemIds,
          });
        setItems(next);
      } catch (e) {
        setLoadError(
          e instanceof Error ? e.message : "Не удалось изменить порядок",
        );
      }
    },
    [tripId],
  );

  async function bulkSetLinesDone(
    done: boolean,
    scope: "all_lines" | "section_lines",
    sectionItemId?: string,
  ) {
    const key =
      scope === "all_lines"
        ? done
          ? "all_on"
          : "all_off"
        : done
          ? (`section:${sectionItemId}:on` as const)
          : (`section:${sectionItemId}:off` as const);
    setBulkWorking(key);
    setLoadError(null);
    try {
      const api = getApiClient();
      const { items: next } =
        await api.trip.packChecklist.bulkSetLinesDone.mutate({
          tripId,
          done,
          scope,
          ...(scope === "section_lines" && sectionItemId
            ? { sectionItemId }
            : {}),
        });
      setItems(next);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "Не удалось обновить отметки",
      );
    } finally {
      setBulkWorking(null);
    }
  }

  const doneLines = lineRows.filter((r) => r.done).length;
  const effectiveKind = pendingParentSectionId ? "line" : newKind;

  const checklistDndActions: ChecklistDndActions = {
    tripId,
    editingId,
    beginEdit,
    saveEdit,
    setEditingId,
    editDraftTitle,
    setEditDraftTitle,
    editDraftQty,
    setEditDraftQty,
    editDraftUnit,
    setEditDraftUnit,
    editSaving,
    toggleDone,
    duplicateLine,
    removeRow,
    togglingId,
    removingId,
    duplicatingId,
    bulkBusy: bulkWorking !== null,
    bulkSetLinesDone,
    toggleSectionCollapsed,
    pendingParentSectionId,
    setPendingParentSectionId,
    setComposerGlow,
    focusComposerTitle,
    newTitleRef,
    qtyLabelText: (row) => qtyLabel(row as ChecklistRow),
    lineCountBySectionId,
  };

  return (
    <main
      className={cn(
        "mx-auto min-h-screen w-full max-w-2xl px-4 pt-8 sm:px-6 sm:pt-10",
        isLoading
          ? "pb-12"
          : undoDeleteSnapshot
            ? "pb-[calc(188px+env(safe-area-inset-bottom))] sm:pb-[calc(180px+env(safe-area-inset-bottom))]"
            : "pb-[calc(132px+env(safe-area-inset-bottom))] sm:pb-[calc(128px+env(safe-area-inset-bottom))]",
      )}
    >
      <div className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              Чеклист
            </h1>
            {tripTitle ? (
              <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                {tripTitle}
              </p>
            ) : null}
          </div>
          {hintResolved ? (
            personalHintVisible ? null : (
              <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
                Личный список: видите и меняете только вы.
              </p>
            )
          ) : (
            <p className="max-w-md text-[13px] leading-relaxed text-muted-foreground">
              Личный список: видите и меняете только вы.
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2 self-start sm:self-end">
          <Link
            href={`/trips/${tripId}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "font-normal shadow-none",
            )}
          >
            К поездке
          </Link>
          {!isLoading ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 font-normal shadow-none"
              disabled={resettingPreset}
              title="Заменить список на типовой шаблон с нуля"
              onClick={() => void resetFromPreset()}
            >
              {resettingPreset ? (
                <Loader2 className="size-3.5 shrink-0 animate-spin" />
              ) : (
                <RotateCcw className="size-3.5 shrink-0" />
              )}
              Шаблон
            </Button>
          ) : null}
        </div>
      </div>

      {loadError ? (
        <p className="mb-4 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      {!isLoading && hintResolved && personalHintVisible ? (
        <div
          className="mb-5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 text-[13px] leading-relaxed text-foreground shadow-sm dark:border-primary/28 dark:bg-primary/12"
          role="status"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="min-w-0 flex-1 text-muted-foreground">
              <span className="text-foreground">Только вы</span> видите эти
              отметки и пункты. Новое вводите в{" "}
              <span className="text-foreground">панели внизу</span>; иконка с
              ползунками — секция или пункт, число и шт/пар и т.п. Кнопка
              «Строка» у секции открывает то же поле; подсветится рамкой. В
              одной строке можно набрать{" "}
              <span className="tabular-nums text-foreground">Носки — 5 шт</span>{" "}
              (поле числа внизу тогда оставьте пустым). «Шаблон» — заново ваш
              типовой список, не затрагивая других.{" "}
              <span className="text-foreground">Enter</span> в нижнем поле —{" "}
              добавить; <span className="text-foreground">Esc</span> — свернуть
              настройки панели. Порядок строк и секций — перетаскивание за ручку
              слева (при поиске перестановка отключена).
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="-me-1 h-8 shrink-0 font-normal text-muted-foreground"
              onClick={dismissPersonalHint}
            >
              Понятно
            </Button>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : (
        <>
          <div className="mb-5 space-y-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <div
                className="flex items-center gap-2 text-[13px] tabular-nums text-muted-foreground"
                title="Отмечено / всего пунктов со чекбоксом"
              >
                <span className="font-medium text-foreground">{doneLines}</span>
                <span className="text-muted-foreground/35" aria-hidden>
                  /
                </span>
                <span>{lineRows.length}</span>
                <span className="sr-only" aria-live="polite">
                  Отмечено {doneLines} из {lineRows.length} строк
                </span>
                {lineRows.length > 0 ? (
                  <span className="text-muted-foreground/80" aria-hidden>
                    ({Math.round((doneLines / lineRows.length) * 100)}%)
                  </span>
                ) : null}
              </div>
              {lineRows.length > 0 ? (
                <span className="flex flex-wrap items-center gap-1 border-l border-border/60 ps-3 text-[12px] text-muted-foreground">
                  <span className="me-1" aria-hidden>
                    Массово:
                  </span>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-[12px] text-foreground hover:bg-muted/80"
                    disabled={bulkWorking !== null}
                    onClick={() => void bulkSetLinesDone(true, "all_lines")}
                  >
                    Отметить всё
                  </button>
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-[12px] text-foreground hover:bg-muted/80"
                    disabled={bulkWorking !== null}
                    onClick={() => void bulkSetLinesDone(false, "all_lines")}
                  >
                    Снять все
                  </button>
                </span>
              ) : null}
            </div>
            <div
              className="h-1 overflow-hidden rounded-full bg-muted dark:bg-muted/65"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={lineRows.length > 0 ? lineRows.length : 1}
              aria-valuenow={lineRows.length > 0 ? doneLines : 0}
              aria-label="Доля собранных пунктов"
            >
              <div
                className="h-full rounded-full bg-primary/70 transition-[width] duration-300 ease-out dark:bg-primary/60"
                style={{
                  width:
                    lineRows.length === 0
                      ? "0%"
                      : `${(doneLines / lineRows.length) * 100}%`,
                }}
              />
            </div>
            {items.length > 0 ? (
              <div className="relative">
                <Search
                  className="pointer-events-none absolute inset-s-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  type="search"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                  placeholder="Поиск по списку…"
                  autoComplete="off"
                  aria-label="Поиск по чеклисту"
                  className="w-full rounded-lg border border-input bg-background py-2 ps-10 pe-3 text-[13px] shadow-none outline-none placeholder:text-muted-foreground/55 focus-visible:ring-2 focus-visible:ring-ring/35"
                />
              </div>
            ) : null}
          </div>

          {items.length === 0 ? (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/50">
              <li className="py-14 text-center text-[13px] text-muted-foreground">
                Введите первый пункт в панели внизу или выберите «Шаблон».
              </li>
            </ul>
          ) : filtering && visibleRows.length === 0 ? (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/50">
              <li className="py-14 text-center text-[13px] text-muted-foreground">
                Ничего не нашлось. Очистите поиск или проверьте написание.
              </li>
            </ul>
          ) : filtering ? (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/50">
              {visibleRows.map((row) => {
                const isSubgroup = Boolean(row.parentItemId);
                const qtyPretty = qtyLabel(row);
                if (row.kind === "group") {
                  const sectProg = sectionLineProgress(
                    items as PackItemView[],
                    row.id,
                  );
                  const sectionComplete = sectionLinesAllComplete(sectProg);
                  const sectionCollapsed = collapsedSectionIds.has(row.id);
                  return (
                    <li
                      key={row.id}
                      className={cn(
                        "px-3 py-3 transition-[background-color] duration-200 sm:py-2.5",
                        sectionComplete
                          ? "bg-emerald-500/14 dark:bg-emerald-400/14"
                          : "bg-muted/20",
                      )}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <div className="min-w-0 flex-1">
                          {editingId === row.id ? (
                            <div className="space-y-2">
                              <input
                                value={editDraftTitle}
                                onChange={(e) =>
                                  setEditDraftTitle(e.target.value)
                                }
                                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none"
                                maxLength={200}
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  className="font-normal"
                                  disabled={
                                    editSaving ||
                                    editDraftTitle.trim().length < 1
                                  }
                                  onClick={() => void saveEdit()}
                                >
                                  {editSaving ? "Сохранение…" : "Сохранить"}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="font-normal text-muted-foreground"
                                  disabled={editSaving}
                                  onClick={() => setEditingId(null)}
                                >
                                  Отмена
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex min-h-10 items-center gap-2 sm:min-h-11">
                              <button
                                type="button"
                                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground sm:h-10 sm:w-10"
                                aria-expanded={!sectionCollapsed}
                                aria-label={
                                  sectionCollapsed
                                    ? `Развернуть секцию ${row.title}`
                                    : `Свернуть секцию ${row.title}`
                                }
                                onClick={() => toggleSectionCollapsed(row.id)}
                              >
                                {sectionCollapsed ? (
                                  <ChevronRight
                                    className="size-5"
                                    aria-hidden
                                  />
                                ) : (
                                  <ChevronDown className="size-5" aria-hidden />
                                )}
                              </button>
                              <div className="flex min-w-0 flex-1 flex-col justify-center gap-px">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-px">
                                  <p
                                    className={cn(
                                      "text-[13px] font-medium leading-tight",
                                      sectionComplete
                                        ? "text-emerald-900 dark:text-emerald-100"
                                        : "text-foreground",
                                    )}
                                    title={
                                      sectionComplete
                                        ? "Все пункты в секции выполнены"
                                        : undefined
                                    }
                                  >
                                    {row.title}
                                  </p>
                                  {sectProg.total > 0 ? (
                                    <span
                                      className={cn(
                                        "text-[11px] tabular-nums leading-none",
                                        sectionComplete
                                          ? "font-medium text-emerald-800 dark:text-emerald-200"
                                          : "text-muted-foreground",
                                      )}
                                      title={
                                        sectionComplete
                                          ? "Все пункты выполнены"
                                          : "Готово строк в секции"
                                      }
                                    >
                                      {sectProg.done}/{sectProg.total}
                                    </span>
                                  ) : null}
                                </div>
                                {(lineCountBySectionId.get(row.id) ?? 0) ===
                                0 ? (
                                  <p className="text-[11px] leading-snug text-muted-foreground/90">
                                    Пока нет строк — кнопка «Строка» справа или
                                    панель внизу.
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </div>
                        {editingId === row.id ? null : (
                          <div className="flex shrink-0 flex-row flex-wrap items-center justify-end gap-1 sm:ms-auto sm:min-h-10">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-8 gap-1 font-normal text-muted-foreground"
                              onClick={() => {
                                setPendingParentSectionId(row.id);
                                setComposerGlow(true);
                                focusComposerTitle(newTitleRef.current);
                              }}
                            >
                              <ListPlus className="size-3.5" />
                              Строка
                            </Button>
                            <SectionOverflowMenu
                              bulkBusy={bulkWorking !== null}
                              showBulk={sectProg.total > 0}
                              onBulkAll={() =>
                                void bulkSetLinesDone(
                                  true,
                                  "section_lines",
                                  row.id,
                                )
                              }
                              onBulkClear={() =>
                                void bulkSetLinesDone(
                                  false,
                                  "section_lines",
                                  row.id,
                                )
                              }
                              onEdit={() => beginEdit(row)}
                              onDelete={() => void removeRow(row)}
                              deleteBusy={removingId === row.id}
                            />
                          </div>
                        )}
                      </div>
                    </li>
                  );
                }

                return (
                  <li
                    key={row.id}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 transition-colors hover:bg-muted/25 sm:py-2",
                      isSubgroup && "pl-6 sm:pl-9",
                    )}
                  >
                    <label
                      className={cn(
                        "flex min-h-11 min-w-0 flex-1 cursor-pointer gap-3 pe-1",
                        editingId === row.id
                          ? "items-start py-1.5"
                          : "items-center py-0.5",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={row.done}
                        disabled={togglingId === row.id}
                        onChange={() => void toggleDone(row)}
                        className={cn(
                          "size-5 shrink-0 rounded border-input",
                          editingId === row.id && "mt-1.5",
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        {editingId === row.id ? (
                          <span className="block space-y-2">
                            <input
                              value={editDraftTitle}
                              onChange={(e) =>
                                setEditDraftTitle(e.target.value)
                              }
                              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-none"
                              autoFocus
                              maxLength={200}
                            />
                            <div className="flex flex-wrap items-end gap-2">
                              <input
                                inputMode="numeric"
                                placeholder="Кол-во"
                                value={editDraftQty}
                                aria-label="Количество (необязательно)"
                                onChange={(e) =>
                                  setEditDraftQty(e.target.value)
                                }
                                className="h-9 w-19 rounded-md border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/65"
                              />
                              <input
                                placeholder="шт"
                                aria-label="Единица измерения"
                                value={editDraftUnit}
                                onChange={(e) =>
                                  setEditDraftUnit(e.target.value)
                                }
                                maxLength={12}
                                list={`units-${tripId}-edit`}
                                className="h-9 min-w-22 max-w-28 flex-1 rounded-md border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/65"
                              />
                              <datalist id={`units-${tripId}-edit`}>
                                {UNIT_QUICK.map((u) => (
                                  <option key={u} value={u} />
                                ))}
                              </datalist>
                            </div>
                            <span className="flex flex-wrap gap-2 pt-1">
                              <Button
                                type="button"
                                size="sm"
                                className="font-normal"
                                disabled={
                                  editSaving || editDraftTitle.trim().length < 1
                                }
                                onClick={() => void saveEdit()}
                              >
                                {editSaving ? "Сохранение…" : "Сохранить"}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="font-normal text-muted-foreground"
                                disabled={editSaving}
                                onClick={() => setEditingId(null)}
                              >
                                Отмена
                              </Button>
                            </span>
                          </span>
                        ) : (
                          <>
                            <span
                              className={cn(
                                "wrap-break-word text-[14px] leading-snug tracking-[-0.01em]",
                                row.done &&
                                  "text-muted-foreground line-through decoration-muted-foreground/60",
                              )}
                            >
                              {row.title}
                              {qtyPretty ? (
                                <span className="ms-2 tabular-nums text-muted-foreground">
                                  {qtyPretty}
                                </span>
                              ) : null}
                            </span>
                          </>
                        )}
                      </span>
                    </label>
                    {editingId === row.id ? null : (
                      <LineOverflowMenu
                        dupBusy={duplicatingId === row.id}
                        dupDisabled={
                          duplicatingId === row.id || removingId === row.id
                        }
                        onDuplicate={() => void duplicateLine(row)}
                        onEdit={() => beginEdit(row)}
                        onDelete={() => void removeRow(row)}
                        deleteBusy={removingId === row.id}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <ChecklistDndList
              items={items as PackItemView[]}
              collapsedSectionIds={collapsedSectionIds}
              actions={checklistDndActions}
              onReorderPeers={reorderPeers}
            />
          )}
        </>
      )}

      {!isLoading && undoDeleteSnapshot ? (
        <div
          className="pointer-events-none fixed inset-x-0 bottom-[calc(108px+env(safe-area-inset-bottom))] z-42 flex justify-center px-3"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/95 px-3 py-2.5 text-[13px] shadow-lg backdrop-blur-md dark:bg-background/92">
            <p className="min-w-0 text-muted-foreground">
              Удалено:{" "}
              <span className="font-medium text-foreground">
                {undoDeleteSnapshot.length === 1
                  ? undoDeleteSnapshot[0]!.title
                  : `${undoDeleteSnapshot.length} пунктов`}
              </span>
            </p>
            <span className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="font-normal"
                onClick={() => void restoreDeletedSnapshot()}
              >
                Вернуть
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2 font-normal text-muted-foreground"
                aria-label="Скрыть уведомление об удалении"
                onClick={() => setUndoDeleteSnapshot(null)}
              >
                Скрыть
              </Button>
            </span>
          </div>
        </div>
      ) : null}

      {!isLoading ? (
        <footer
          className={cn(
            "pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center",
            "px-3 pb-[calc(10px+env(safe-area-inset-bottom))] pt-2",
          )}
          aria-label="Добавить в чеклист"
        >
          <div
            ref={composerShellRef}
            className="pointer-events-auto relative w-full max-w-2xl"
          >
            {composerExtrasOpen ? (
              <button
                type="button"
                aria-label="Закрыть настройки"
                className="fixed inset-0 z-45 bg-background/55 backdrop-blur-[1px] dark:bg-black/35"
                onClick={() => setComposerExtrasOpen(false)}
              />
            ) : null}

            <form
              className={cn(
                "relative z-50 overflow-hidden rounded-2xl border border-border/70 bg-background/92 shadow-[0_-8px_32px_-16px_rgb(0,0,0,0.2)] backdrop-blur-md",
                "dark:border-border/50 dark:bg-background/90",
              )}
              onSubmit={(e) => void onAddRoot(e)}
            >
              {composerExtrasOpen ? (
                <div
                  id="composer-extras-region"
                  className={cn(
                    "border-b border-border/55 px-3 py-2.5",
                    "space-y-2.5",
                  )}
                  role="region"
                  aria-label={
                    pendingParentSectionId ? "Число и единица" : "Тип пункта"
                  }
                >
                  {!pendingParentSectionId ? (
                    <fieldset className="flex flex-wrap gap-3 text-[13px] text-muted-foreground">
                      <legend className="sr-only">Что добавляем</legend>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="new-kind"
                          checked={newKind === "group"}
                          onChange={() => setNewKind("group")}
                          className="border-input text-primary"
                        />
                        <FolderPlus
                          className="size-3.5 opacity-75"
                          aria-hidden
                        />
                        Секция
                      </label>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input
                          type="radio"
                          name="new-kind"
                          checked={newKind === "line"}
                          onChange={() => setNewKind("line")}
                          className="border-input text-primary"
                        />
                        Пункт
                      </label>
                    </fieldset>
                  ) : null}

                  {effectiveKind === "line" ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        inputMode="numeric"
                        placeholder="Количество"
                        value={newQty}
                        aria-label="Количество (необязательно)"
                        onChange={(e) => setNewQty(e.target.value)}
                        className="h-10 w-20 shrink-0 rounded-lg border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/45"
                      />
                      <input
                        placeholder="шт, пар…"
                        value={newUnit}
                        aria-label="Единица измерения"
                        onChange={(e) => setNewUnit(e.target.value)}
                        list={`units-${tripId}-new`}
                        maxLength={12}
                        className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-2 text-sm shadow-none placeholder:text-muted-foreground/45 sm:max-w-52"
                      />
                      <datalist id={`units-${tripId}-new`}>
                        {UNIT_QUICK.map((u) => (
                          <option key={u} value={u} />
                        ))}
                      </datalist>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    className="w-full rounded-lg py-1.5 text-center text-[12px] text-muted-foreground hover:bg-muted/50"
                    onClick={() => setComposerExtrasOpen(false)}
                  >
                    Свернуть
                  </button>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5 p-2 sm:p-2.5">
                {pendingParentSectionId ? (
                  <div className="flex justify-center px-1">
                    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground">
                      <span className="max-w-52 truncate">
                        {items.find((i) => i.id === pendingParentSectionId)
                          ?.title ?? "…"}
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded-full px-1 text-foreground hover:bg-muted/80"
                        aria-label="Добавлять не в секцию"
                        onClick={() => {
                          setPendingParentSectionId(null);
                          setComposerExtrasOpen(false);
                        }}
                      >
                        ×
                      </button>
                    </span>
                  </div>
                ) : null}

                <div className="flex min-h-11 items-center gap-1.5 sm:gap-2">
                  <input
                    ref={newTitleRef}
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    aria-label={
                      pendingParentSectionId
                        ? "Название строки внутри секции"
                        : newKind === "group"
                          ? "Название секции"
                          : "Название пункта"
                    }
                    placeholder={
                      pendingParentSectionId
                        ? "Название…"
                        : newKind === "group"
                          ? "Название секции…"
                          : "Пункт или «Носки — 5 шт»…"
                    }
                    maxLength={200}
                    className={cn(
                      "min-h-10 min-w-0 flex-1 rounded-xl border border-transparent bg-muted/30 px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground/45 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-muted/22",
                      composerGlow &&
                        !composerExtrasOpen &&
                        "checklist-composer-glow",
                    )}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11 shrink-0 rounded-xl border-border/70 shadow-none sm:size-10"
                    aria-expanded={composerExtrasOpen}
                    aria-controls="composer-extras-region"
                    title={
                      pendingParentSectionId
                        ? "Число и единица"
                        : "Тип и количество"
                    }
                    aria-label={
                      pendingParentSectionId
                        ? "Число и единица"
                        : "Тип и количество"
                    }
                    onClick={() => setComposerExtrasOpen((open) => !open)}
                  >
                    <SlidersHorizontal
                      className="size-[18px] text-muted-foreground"
                      aria-hidden
                    />
                  </Button>
                  <Button
                    type="submit"
                    className="h-11 min-h-10 shrink-0 rounded-xl px-4 font-normal shadow-none sm:h-10"
                    disabled={adding || newTitle.trim().length < 1}
                  >
                    {adding ? "…" : "Добавить"}
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </footer>
      ) : null}
    </main>
  );
}
