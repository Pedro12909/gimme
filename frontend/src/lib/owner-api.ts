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
  shareToken: string;
  createdAt: string;
};

export type Item = {
  listId: string;
  itemId: string;
  url: string;
  title?: string;
  note?: string;
  imageUrl?: string;
  price?: string;
  createdAt: string;
};

export type ListWithItems = List & { items: Item[] };

export type ListInput = { title: string; description: string };
// Empty optional fields are removed by the API
export type ItemInput = {
  url: string;
  title: string;
  note: string;
  imageUrl: string;
  price: string;
};

export type LinkPreview = { title?: string; imageUrl?: string; price?: string };

const listPath = (listId: string) => `/lists/${encodeURIComponent(listId)}`;
const itemPath = (listId: string, itemId: string) =>
  `${listPath(listId)}/items/${encodeURIComponent(itemId)}`;

export const getLists = () => ownerRequest<List[]>("/lists");

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

export const deleteItem = (listId: string, itemId: string) =>
  ownerRequest<void>(itemPath(listId, itemId), { method: "DELETE" });

export const newShareLink = (listId: string) =>
  ownerRequest<{ shareToken: string }>(`${listPath(listId)}/share`, {
    method: "POST",
  });

export const previewLink = (url: string) =>
  ownerRequest<LinkPreview>("/preview", json("POST", { url }));

export const shareUrl = (shareToken: string) =>
  `${window.location.origin}/s/${shareToken}`;
