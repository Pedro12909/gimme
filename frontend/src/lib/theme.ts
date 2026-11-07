import { useSyncExternalStore } from "react";

// The initial theme is applied by the inline script in index.html, before first paint.
// Without a stored choice the app follows the device; a stored choice overrides it.
const STORAGE_KEY = "gimme:theme";

export type ThemeChoice = "device" | "light" | "dark";

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "device";
  } catch {
    return "device";
  }
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "device") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Without storage the choice just lasts for this visit
  }

  const dark =
    choice === "device"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : choice === "dark";
  document.documentElement.classList.toggle("dark", dark);
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const CHANGE_EVENT = "gimme:themechange";

// Re-renders when the theme is changed here or, while following the device, by the device.
// index.html's own listener updates the page first, as it was registered earlier.
function subscribe(onChange: () => void) {
  const query = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(CHANGE_EVENT, onChange);
  query.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    query.removeEventListener("change", onChange);
  };
}

const snapshot = () =>
  `${readThemeChoice()}:${document.documentElement.classList.contains("dark")}`;

export function useTheme() {
  const [choice, dark] = useSyncExternalStore(subscribe, snapshot).split(":");
  return { choice: choice as ThemeChoice, dark: dark === "true" };
}
