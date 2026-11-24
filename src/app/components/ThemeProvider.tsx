
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from "react";

type Theme = "dark" | "light";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const STORAGE_KEY = "chessverse-theme";
const THEME_EVENT = "chessverse-theme-change";

const ThemeContext = createContext<ThemeContextType | null>(null);

// Đọc theme đã lưu trong trình duyệt
function getThemeSnapshot(): Theme {
  return localStorage.getItem(STORAGE_KEY) === "light"
    ? "light"
    : "dark";
}

// Theme mặc định khi render phía server
function getServerThemeSnapshot(): Theme {
  return "dark";
}

// Theo dõi thay đổi theme
function subscribeToTheme(callback: () => void) {
  const handleChange = () => {
    callback();
  };

  window.addEventListener("storage", handleChange);
  window.addEventListener(THEME_EVENT, handleChange);

  return () => {
    window.removeEventListener("storage", handleChange);
    window.removeEventListener(THEME_EVENT, handleChange);
  };
}

export function ThemeProvider({
  children,
}: {
  children: ReactNode;
}) {
  const theme = useSyncExternalStore(
    subscribeToTheme,
    getThemeSnapshot,
    getServerThemeSnapshot,
  );

  // Đồng bộ theme với HTML
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  function toggleTheme() {
    const nextTheme: Theme =
      theme === "dark" ? "light" : "dark";

    localStorage.setItem(STORAGE_KEY, nextTheme);
    document.documentElement.dataset.theme = nextTheme;

    // Thông báo cho các component và tab đang theo dõi
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error(
      "useTheme phải được sử dụng bên trong ThemeProvider",
    );
  }

  return context;
}