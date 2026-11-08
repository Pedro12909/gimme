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
  // The list the app opens on at /. Every owner has exactly one.
  isDefault?: boolean;
};

// From GET /lists only: what the sidebar needs, including the counts for the views
export type ListSummary = List & {
  itemCount: number;
  starredCount: number;
  gotCount: number;
  previewImages?: string[];
};

export type Lists = { defaultListId?: string; lists: ListSummary[] };

// The views across every list
export type ItemsView = "all" | "want" | "got";

export type Item = {
  listId: string;
  itemId: string;
  // Items can be just a name, with no link
  url?: string;
  title?: string;
  note?: string;
  imageUrl?: string;
  // Set when the image is a photo the owner uploaded
  imageKey?: string;
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
  // "" clears it on update; an item keeps a title or a url
  url?: string;
  title: string;
  note: string;
  imageUrl: string;
  price: string;
  vendor: string;
  size: string;
  alternatives: string[];
  tags: string[];
  // A finished upload to attach as the item's photo; it replaces imageUrl
  imageUpload?: string;
  starred: boolean;
  got: boolean;
};

const listPath = (listId: string) => `/lists/${encodeURIComponent(listId)}`;
const itemPath = (listId: string, itemId: string) =>
  `${listPath(listId)}/items/${encodeURIComponent(itemId)}`;

// Oldest first. Also makes a new owner's first list, so the app always has one to open.
export const getLists = () => ownerRequest<Lists>("/lists");

export const getItems = (view: ItemsView) =>
  ownerRequest<Item[]>(`/items?view=${view}`);

export const getList = (listId: string) =>
  ownerRequest<ListWithItems>(listPath(listId));

export const createList = (input: ListInput) =>
  ownerRequest<List>("/lists", json("POST", input));

export const updateList = (listId: string, input: Partial<ListInput>) =>
  ownerRequest<List>(listPath(listId), json("PATCH", input));

// "Open this list first": the old default stops being it in the same write
export const setDefaultList = (listId: string) =>
  ownerRequest<List>(listPath(listId), json("PATCH", { isDefault: true }));

export const deleteList = (listId: string) =>
  ownerRequest<void>(listPath(listId), { method: "DELETE" });

// Only the fields given are stored: a name, a link, or both
export const addItem = (listId: string, input: Partial<ItemInput>) =>
  ownerRequest<Item>(`${listPath(listId)}/items`, json("POST", input));

// Only the fields sent change
export const updateItem = (
  listId: string,
  itemId: string,
  input: Partial<ItemInput>,
) => ownerRequest<Item>(itemPath(listId, itemId), json("PATCH", input));

// A copy in another list, at the bottom of its order. The original stays, claim and all.
export const copyItemToList = (listId: string, itemId: string, to: string) =>
  ownerRequest<Item>(`${itemPath(listId, itemId)}/copy`, json("POST", { to }));

// Reordering only ever changes the moved item's position key
export const moveItem = (listId: string, itemId: string, position: string) =>
  ownerRequest<Item>(itemPath(listId, itemId), json("PATCH", { position }));

export const deleteItem = (listId: string, itemId: string) =>
  ownerRequest<void>(itemPath(listId, itemId), { method: "DELETE" });

export const newShareLink = (listId: string) =>
  ownerRequest<{ shareToken: string }>(`${listPath(listId)}/share`, {
    method: "POST",
  });

// Uploads a resized photo and returns the key to save with the item as imageUpload
export async function uploadImage(listId: string, image: Blob) {
  const { key, url, fields } = await ownerRequest<{
    key: string;
    url: string;
    fields: Record<string, string>;
  }>(`${listPath(listId)}/images`, json("POST", { contentType: image.type }));

  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  // S3 requires the file to be the last field
  form.append("file", image);

  const response = await fetch(url, { method: "POST", body: form });
  if (!response.ok) {
    throw new ApiError(response.status, "Upload failed");
  }

  return key;
}

// The owner's own details; guests see the display name on shared lists ("Pedro's list")
export type Me = { displayName?: string };

export const getMe = () => ownerRequest<Me>("/me");

// An empty name removes it
export const updateMe = (displayName: string) =>
  ownerRequest<Me>("/me", json("PATCH", { displayName }));

export const shareUrl = (shareToken: string) =>
  `${window.location.origin}/s/${shareToken}`;
