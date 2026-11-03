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
  // Set when the image is a photo the owner uploaded
  imageKey?: string;
  price?: string;
  priceValue?: number;
  vendor?: string;
  size?: string;
  alternatives?: string[];
  tags?: string[];
  position?: string;
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
  vendor: string;
  size: string;
  alternatives: string[];
  tags: string[];
  // A finished upload to attach as the item's photo; it replaces imageUrl
  imageUpload?: string;
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

export const previewLink = (url: string) =>
  ownerRequest<LinkPreview>("/preview", json("POST", { url }));

export const shareUrl = (shareToken: string) =>
  `${window.location.origin}/s/${shareToken}`;
