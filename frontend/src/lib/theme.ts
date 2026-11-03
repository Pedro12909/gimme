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
}
