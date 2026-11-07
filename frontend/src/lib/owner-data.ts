import { useQuery, type QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/http";
import {
  getItems,
  getList,
  getLists,
  type Item,
  type ItemsView,
  type ListWithItems,
} from "@/lib/owner-api";

// What the main column shows: one list, or a view across all of them
export type Selection =
  { kind: "list"; listId: string } | { kind: "view"; view: ItemsView };

export const VIEW_PATHS: Record<ItemsView, string> = {
  all: "/all",
  want: "/want",
  got: "/got",
};

export const VIEW_TITLES: Record<ItemsView, string> = {
  all: "All items",
  want: "Want most",
  got: "Got it",
};

// The default list lives at /, every other list at its own path
export const listPath = (listId: string, isDefault = false) =>
  isDefault ? "/" : `/lists/${listId}`;

export const listsKey = ["lists"];
export const listKey = (listId: string) => ["list", listId];
export const itemsKey = (view: ItemsView) => ["items", view];

export function useLists() {
  return useQuery({ queryKey: listsKey, queryFn: getLists });
}

export function useList(listId: string | undefined) {
  return useQuery({
    queryKey: listKey(listId ?? ""),
    queryFn: () => getList(listId!),
    enabled: listId !== undefined,
    retry: (count, err) =>
      !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

export function useViewItems(view: ItemsView | undefined) {
  return useQuery({
    queryKey: itemsKey(view ?? "all"),
    queryFn: () => getItems(view!),
    enabled: view !== undefined,
  });
}

// The counts in the sidebar and the views come from the server again
export function refreshCounts(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: listsKey });
  queryClient.invalidateQueries({ queryKey: ["items"] });
}

// Puts a changed item everywhere it's shown, so tiles change as the owner types
export function patchItemInCache(
  queryClient: QueryClient,
  listId: string,
  itemId: string,
  change: Partial<Item>,
) {
  const apply = (item: Item) =>
    item.itemId === itemId && item.listId === listId
      ? { ...item, ...change }
      : item;
  queryClient.setQueryData<ListWithItems>(
    listKey(listId),
    (list) => list && { ...list, items: list.items.map(apply) },
  );
  queryClient.setQueriesData<Item[]>({ queryKey: ["items"] }, (items) =>
    items?.map(apply),
  );
}

export function removeItemFromCache(
  queryClient: QueryClient,
  listId: string,
  itemId: string,
) {
  const keep = (item: Item) =>
    !(item.itemId === itemId && item.listId === listId);
  queryClient.setQueryData<ListWithItems>(
    listKey(listId),
    (list) => list && { ...list, items: list.items.filter(keep) },
  );
  queryClient.setQueriesData<Item[]>({ queryKey: ["items"] }, (items) =>
    items?.filter(keep),
  );
}

export function addItemToCache(queryClient: QueryClient, item: Item) {
  queryClient.setQueryData<ListWithItems>(
    listKey(item.listId),
    (list) => list && { ...list, items: [...list.items, item] },
  );
  queryClient.setQueryData<Item[]>(
    itemsKey("all"),
    (items) => items && [...items, item],
  );
}
