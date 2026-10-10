import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toggleTheme, useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const theme = useTheme();
  const label =
    theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <Button
      variant="ghost"
      size="icon-lg"
      aria-label={label}
      title={label}
      onClick={toggleTheme}
      className="text-muted-foreground"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}
