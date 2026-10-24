import { useEffect } from "react";

const APP_NAME = "gimme";

// "Pedro's Birthday · gimme" in the tab, history and bookmarks; back to "gimme" on leaving
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [title]);
}
