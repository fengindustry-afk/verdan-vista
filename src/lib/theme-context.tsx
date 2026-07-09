import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { applyTheme, getStoredTheme, storeTheme, type ThemeMode } from "./theme";

interface ThemeContextValue {
  setId: string;
  mode: ThemeMode;
  setThemeSet: (id: string) => void;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [{ setId, mode }, setState] = useState(getStoredTheme);

  useEffect(() => {
    applyTheme(setId, mode);
    storeTheme(setId, mode);
  }, [setId, mode]);

  const setThemeSet = (id: string) => setState((s) => ({ ...s, setId: id }));
  const setMode = (m: ThemeMode) => setState((s) => ({ ...s, mode: m }));
  const toggleMode = () => setState((s) => ({ ...s, mode: s.mode === "dark" ? "light" : "dark" }));

  return (
    <ThemeContext.Provider value={{ setId, mode, setThemeSet, setMode, toggleMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
