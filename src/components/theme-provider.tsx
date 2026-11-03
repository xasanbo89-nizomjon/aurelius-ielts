"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (typeof window !== "undefined") {
        const saved = localStorage.getItem("aurelius_theme") as Theme | null;
        if (saved === "light" || saved === "dark") {
          setThemeState(saved);
          applyTheme(saved);
          return;
        }
      }
    } catch {
      // Safe fallback for restricted environments (e.g. cookies disabled, incognito or sandboxed iframes)
    }
    applyTheme("dark");
  }, []);

  function applyTheme(next: Theme) {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (next === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
  }

  function setTheme(next: Theme) {
    setThemeState(next);
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("aurelius_theme", next);
      }
    } catch {
      // Ignore storage write errors in private/sandboxed modes
    }
    applyTheme(next);
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
  }

  // Stable SSR-safe context value: defaults to dark during SSR/pre-hydration
  const isDark = mounted ? theme === "dark" : true;

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme, isDark, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    // Graceful fallback for components rendered outside provider or during SSR
    return {
      theme: "dark" as Theme,
      setTheme: () => {},
      toggleTheme: () => {},
      isDark: true,
      mounted: false,
    };
  }
  return context;
}
