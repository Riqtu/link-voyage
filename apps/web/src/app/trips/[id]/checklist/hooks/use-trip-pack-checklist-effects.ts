"use client";

import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
} from "react";
import { CHECKLIST_PERSONAL_HINT_KEY } from "../lib/constants";
import type { PackItemView } from "../lib/pack-layout";

type Args = {
  collapseKey: string;
  collapsedSectionIds: Set<string>;
  undoDeleteSnapshot: PackItemView[] | null;
  setUndoDeleteSnapshot: Dispatch<SetStateAction<PackItemView[] | null>>;
  undoTimerRef: MutableRefObject<number | null>;
  composerGlow: boolean;
  setComposerGlow: Dispatch<SetStateAction<boolean>>;
  composerShellRef: RefObject<HTMLDivElement | null>;
  composerExtrasOpen: boolean;
  setComposerExtrasOpen: Dispatch<SetStateAction<boolean>>;
  load: () => Promise<void>;
  setHintResolved: Dispatch<SetStateAction<boolean>>;
  setPersonalHintVisible: Dispatch<SetStateAction<boolean>>;
};

/** Сборка побочных эффектов страницы чеклиста (persist, загрузка, подсказка, UX композера). */
export function useTripPackChecklistEffects(args: Args) {
  const {
    collapseKey,
    collapsedSectionIds,
    undoDeleteSnapshot,
    setUndoDeleteSnapshot,
    undoTimerRef,
    composerGlow,
    setComposerGlow,
    composerShellRef,
    composerExtrasOpen,
    setComposerExtrasOpen,
    load,
    setHintResolved,
    setPersonalHintVisible,
  } = args;

  useEffect(() => {
    try {
      window.localStorage.setItem(
        collapseKey,
        JSON.stringify([...collapsedSectionIds.values()]),
      );
    } catch {
      /* ignore quota */
    }
  }, [collapseKey, collapsedSectionIds]);

  useEffect(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (!undoDeleteSnapshot?.length) return undefined;

    undoTimerRef.current = window.setTimeout(() => {
      setUndoDeleteSnapshot(null);
      undoTimerRef.current = null;
    }, 12_000);

    return () => {
      if (undoTimerRef.current) {
        clearTimeout(undoTimerRef.current);
        undoTimerRef.current = null;
      }
    };
  }, [undoDeleteSnapshot, setUndoDeleteSnapshot, undoTimerRef]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      const dismissed =
        window.localStorage.getItem(CHECKLIST_PERSONAL_HINT_KEY) === "1";
      setPersonalHintVisible(!dismissed);
    } catch {
      setPersonalHintVisible(true);
    }
    setHintResolved(true);
  }, [setHintResolved, setPersonalHintVisible]);

  useEffect(() => {
    if (!composerGlow) return undefined;
    const id = window.setTimeout(() => setComposerGlow(false), 2200);
    return () => window.clearTimeout(id);
  }, [composerGlow, setComposerGlow]);

  useEffect(() => {
    if (!composerExtrasOpen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setComposerExtrasOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [composerExtrasOpen, setComposerExtrasOpen]);

  useEffect(() => {
    if (!composerExtrasOpen) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const shell = composerShellRef.current;
      if (!shell) return;
      if (shell.contains(event.target as Node)) return;
      setComposerExtrasOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, [composerExtrasOpen, composerShellRef, setComposerExtrasOpen]);
}
