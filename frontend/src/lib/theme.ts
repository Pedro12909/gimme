import { useSyncExternalStore } from "react";

// The initial theme is applied by the inline script in index.html, before first paint.
// Without a stored choice the app follows the device; a stored choice overrides it.
const STORAGE_KEY = "gimme:theme";
const systemDark = () =>
  window.matchMedia("(prefers-color-scheme: dark)").matches;

export type Theme = "light" | "dark";

export function toggleTheme() {
  const next: Theme = document.documentElement.classList.contains("dark")
    ? "light"
    : "dark";
  const matchesSystem = (next === "dark") === systemDark();

  try {
    // Choosing what the device already uses means "follow the device" again
    if (matchesSystem) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Without storage the choice just lasts for this visit
  }

  document.documentElement.classList.toggle("dark", next === "dark");
}

// Re-renders whenever the <html> class changes, whether from the toggle or the device
export function useTheme(): Theme {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributeFilter: ["class"],
      });
      return () => observer.disconnect();
    },
    () =>
      document.documentElement.classList.contains("dark") ? "dark" : "light",
  );
}
