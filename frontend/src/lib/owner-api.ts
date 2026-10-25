import { accessToken } from "@/lib/auth";
import { ApiError, request } from "@/lib/http";

async function ownerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await accessToken();

  if (!token) {
    throw new ApiError(401, "Not signed in");
  }

  return request<T>(path, {
    ...init,
    headers: { ...init?.headers, Authorization: `Bearer ${token}` },
  });
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

export type List = {
  listId: string;
  title: string;
  description?: string;
  // "2026-12-25"
  eventDate?: string;
  // The owner's own tracker: the share link doesn't work
  isPrivate?: boolean;
  shareToken: string;
  createdAt: string;
};

// From GET /lists only: enough to tell lists apart on the lists screen.
// Optional so an older API (mid-deploy) doesn't break the page.
export type ListSummary = List & {
  itemCount?: number;
  previewImages?: string[];
};

export type Item = {
  listId: string;
  itemId: string;
  url: string;
  title?: string;
  note?: string;
  imageUrl?: string;
  price?: string;
  priceValue?: number;
  vendor?: string;
  size?: string;
  alternatives?: string[];
  tags?: string[];
  starred?: boolean;
  got?: boolean;
  position?: string;
  createdAt: string;
};

export type ListWithItems = List & { items: Item[] };

// An empty eventDate clears it
export type ListInput = {
  title: string;
  description: string;
  eventDate: string;
  isPrivate: boolean;
};
// Empty optional fields are removed by the API
export type ItemInput = {
  url: string;
  title: string;
  note: string;
  imageUrl: string;
  price: string;
  vendor: string;
  size: string;
  alternatives: string[];
  tags: string[];
  starred: boolean;
  got: boolean;
};

export type LinkPreview = {
  title?: string;
  imageUrl?: string;
  price?: string;
  vendor?: string;
};

const listPath = (listId: string) => `/lists/${encodeURIComponent(listId)}`;
const itemPath = (listId: string, itemId: string) =>
  `${listPath(listId)}/items/${encodeURIComponent(itemId)}`;

export const getLists = () => ownerRequest<ListSummary[]>("/lists");

export const getList = (listId: string) =>
  ownerRequest<ListWithItems>(listPath(listId));

export const createList = (input: ListInput) =>
  ownerRequest<List>("/lists", json("POST", input));

export const updateList = (listId: string, input: ListInput) =>
  ownerRequest<List>(listPath(listId), json("PATCH", input));

export const deleteList = (listId: string) =>
  ownerRequest<void>(listPath(listId), { method: "DELETE" });

export const addItem = (listId: string, input: ItemInput) =>
  ownerRequest<Item>(`${listPath(listId)}/items`, json("POST", input));

export const updateItem = (listId: string, itemId: string, input: ItemInput) =>
  ownerRequest<Item>(itemPath(listId, itemId), json("PATCH", input));

// Reordering only ever changes the moved item's position key
export const moveItem = (listId: string, itemId: string, position: string) =>
  ownerRequest<Item>(itemPath(listId, itemId), json("PATCH", { position }));

export const deleteItem = (listId: string, itemId: string) =>
  ownerRequest<void>(itemPath(listId, itemId), { method: "DELETE" });

export const newShareLink = (listId: string) =>
  ownerRequest<{ shareToken: string }>(`${listPath(listId)}/share`, {
    method: "POST",
  });

// `text` is what was shared or pasted along with the link, e.g. "Kindle Paperwhite https://amzn.eu/d/abc".
// It names the item when the shop's page can't be read.
export const previewLink = (url: string, text?: string) =>
  ownerRequest<LinkPreview>("/preview", json("POST", { url, text }));

// The owner's own details; guests see the display name on shared lists ("Pedro's list")
export type Me = { displayName?: string };

export const getMe = () => ownerRequest<Me>("/me");

// An empty name removes it
export const updateMe = (displayName: string) =>
  ownerRequest<Me>("/me", json("PATCH", { displayName }));

export const shareUrl = (shareToken: string) =>
  `${window.location.origin}/s/${shareToken}`;
