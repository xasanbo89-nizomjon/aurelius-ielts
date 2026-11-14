"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  isDark: boolean;
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.classList.add("light");
      root.classList.remove("dark");
    }
    try {
      if (typeof window !== "undefined") {
        localStorage.setItem("aurelius_theme", "light");
      }
    } catch {
      // Safe fallback
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: "light",
        setTheme: () => {},
        toggleTheme: () => {},
        isDark: false,
        mounted,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    return {
      theme: "light" as Theme,
      setTheme: () => {},
      toggleTheme: () => {},
      isDark: false,
      mounted: false,
    };
  }
  return context;
}
