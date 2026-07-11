import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

// Cùng key với app sau đăng nhập (src/lib/theme-context.tsx) — đổi theme ở landing
// hay trong app đều dùng chung 1 nguồn, sang trang nào cũng thấy đúng theme vừa chọn.
const STORAGE_KEY = "wealbee-theme";

// App phía sau đăng nhập có thêm theme "midnight" (chưa lộ UI chọn) — landing chỉ
// có 2 chế độ, nên mọi giá trị khác "light" đều coi là dark.
function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (!saved) return "light";
  return saved === "light" ? "light" : "dark";
}

/**
 * Shared theme state persisted to localStorage so the choice is kept
 * consistent across every page (landing, login, …), across reloads, and
 * across the login boundary into the app (src/lib/theme-context.tsx).
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // keep tabs / pages in sync when the value changes elsewhere
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || e.newValue == null) return;
      setTheme(e.newValue === "light" ? "light" : "dark");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toggleTheme = () => setTheme((t) => (t === "dark" ? "light" : "dark"));

  return { theme, setTheme, toggleTheme };
}
