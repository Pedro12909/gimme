import { useEffect, useState } from "react";
import { DEFAULT_VIEW, type ListView } from "@/lib/item-view";

// How a list is laid out, grouped and sorted is remembered per list on this device, so a
// "Gifts" list can stay a grid while "Books" stays a list. Searches and filters are not:
// they answer the question of the moment.
type Remembered = Pick<ListView, "layout" | "groupBy" | "sort">;

const storageKey = (key: string) => `gimme:view:${key}`;

function load(key: string): ListView {
  try {
    const saved = JSON.parse(
      localStorage.getItem(storageKey(key)) ?? "{}",
    ) as Partial<Remembered>;
    return {
      ...DEFAULT_VIEW,
      ...(saved.layout && { layout: saved.layout }),
      ...(saved.groupBy && { groupBy: saved.groupBy }),
      ...(saved.sort && { sort: saved.sort }),
    };
  } catch {
    return DEFAULT_VIEW;
  }
}

// `key` identifies the list: its id for the owner, its share token for guests
export function useListView(key: string) {
  const [view, setView] = useState(() => load(key));

  useEffect(() => {
    const remembered: Remembered = {
      layout: view.layout,
      groupBy: view.groupBy,
      sort: view.sort,
    };
    try {
      localStorage.setItem(storageKey(key), JSON.stringify(remembered));
    } catch {
      // Without storage the view just resets on the next visit
    }
  }, [key, view.layout, view.groupBy, view.sort]);

  return [view, setView] as const;
}
