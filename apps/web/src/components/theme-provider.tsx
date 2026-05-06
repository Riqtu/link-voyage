"use client";

/**
 * Своя тема без next-themes: у next-themes в дереве React ренерится &lt;script&gt;,
 * из‑за чего React 19 пишет в консоль предупреждение. Хранилище ключ `theme`
 * совместимо с прежним next-themes (light | dark | system).
 */
import { syncStandaloneChrome } from "@/lib/theme-chrome";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const STORAGE_KEY = "theme";

export type ThemeSetting = "light" | "dark" | "system";

type ThemeContextValue = {
  theme: ThemeSetting;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: ThemeSetting) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemResolved(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function readStoredTheme(): ThemeSetting {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    /* private mode */
  }
  return "system";
}

function persistTheme(t: ThemeSetting) {
  try {
    localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* ignore */
  }
}

function applyResolved(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  root.style.colorScheme = resolved;
  syncStandaloneChrome(resolved);
}

function resolveFromSetting(setting: ThemeSetting): "light" | "dark" {
  return setting === "system" ? getSystemResolved() : setting;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeSetting>("system");
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light");
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next);
    persistTheme(next);
    const r = resolveFromSetting(next);
    setResolvedTheme(r);
    applyResolved(r);
  }, []);

  useLayoutEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    const r = resolveFromSetting(stored);
    setResolvedTheme(r);
    applyResolved(r);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    function onPrefChange() {
      if (themeRef.current === "system") {
        const nextResolved = getSystemResolved();
        setResolvedTheme(nextResolved);
        applyResolved(nextResolved);
      }
    }
    mq.addEventListener("change", onPrefChange);
    return () => mq.removeEventListener("change", onPrefChange);
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: "system",
      resolvedTheme: "light",
      setTheme: () => {},
    };
  }
  return ctx;
}
