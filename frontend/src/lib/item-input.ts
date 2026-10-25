import { safeHref } from "@/lib/links";
import type { ItemInput, LinkPreview } from "@/lib/owner-api";

// Limits match the owner Lambda's validation
export const ITEM_LIMITS = {
  url: 2048,
  title: 200,
  note: 500,
  price: 32,
  vendor: 60,
  size: 60,
  alternatives: 5,
  tags: 10,
  tag: 30,
};

// Text shared from shopping apps often wraps the link, e.g. "Kindle Paperwhite https://amzn.eu/d/abc",
// so a pasted message is reduced to the link inside it
export function extractLink(text: string) {
  if (!/\s/.test(text.trim())) return text.trim();
  return text.match(/https?:\/\/\S+/)?.[0] ?? text;
}

// Guests see photos on an https page, so the API only takes https ones
export const httpsOnly = (url: string | undefined) =>
  url && safeHref(url)?.startsWith("https://") ? url : "";

// A new item from a pasted link and whatever its preview found
export function newItemInput(url: string, preview?: LinkPreview): ItemInput {
  return {
    url,
    title: preview?.title?.trim().slice(0, ITEM_LIMITS.title) ?? "",
    imageUrl: httpsOnly(preview?.imageUrl),
    price: preview?.price?.trim().slice(0, ITEM_LIMITS.price) ?? "",
    vendor: preview?.vendor?.trim().slice(0, ITEM_LIMITS.vendor) ?? "",
    note: "",
    size: "",
    alternatives: [],
    tags: [],
    starred: false,
    got: false,
  };
}
