"use client";

import * as React from "react";
import type { UseThemeProps } from "next-themes";

const STORAGE_KEY = "theme";
const MEDIA = "(prefers-color-scheme: dark)";

type Stored = "light" | "dark" | "system";

const fallback: UseThemeProps = {
  themes: [],
  setTheme: () => {},
  theme: undefined,
  forcedTheme: undefined,
  resolvedTheme: undefined,
  systemTheme: undefined,
};

const ThemeContext = React.createContext<UseThemeProps | null>(null);

function readStored(): Stored {
  if (typeof window === "undefined") return "system";
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function systemPref(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia(MEDIA).matches ? "dark" : "light";
}

/**
 * Theme context compatible with `useTheme` from next-themes, without injecting a
 * `<script>` (avoids React 19 “script tag while rendering” console errors).
 */
export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Stored>("system");
  const [systemTheme, setSystemTheme] = React.useState<"light" | "dark" | undefined>(
    undefined,
  );

  React.useLayoutEffect(() => {
    setThemeState(readStored());
  }, []);

  React.useEffect(() => {
    const mq = window.matchMedia(MEDIA);
    const onChange = () => setSystemTheme(mq.matches ? "dark" : "light");
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  React.useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      if (e.newValue === "light" || e.newValue === "dark" || e.newValue === "system") {
        setThemeState(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const resolvedTheme: "light" | "dark" =
    theme === "system" ? (systemTheme ?? systemPref()) : theme;

  React.useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(resolvedTheme);
    root.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = React.useCallback((value: React.SetStateAction<string>) => {
    setThemeState((prev) => {
      const next =
        typeof value === "function"
          ? (value as (p: string) => string)(prev)
          : value;
      if (next !== "light" && next !== "dark" && next !== "system") {
        return prev;
      }
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = React.useMemo<UseThemeProps>(
    () => ({
      themes: ["light", "dark", "system"],
      theme,
      setTheme,
      forcedTheme: undefined,
      resolvedTheme,
      systemTheme,
    }),
    [theme, setTheme, resolvedTheme, systemTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useAppTheme(): UseThemeProps {
  return React.useContext(ThemeContext) ?? fallback;
}
