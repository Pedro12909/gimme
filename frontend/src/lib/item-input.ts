import { safeHref } from "@/lib/links";
import type { ItemInput } from "@/lib/owner-api";

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

// When the shop's page can't be read (a bot wall), the link's last words name the item:
// ".../products/air-max-90?colour=red" → "Air max 90"
export function slugName(url: string) {
  try {
    const segment = new URL(url).pathname
      .split("/")
      .map((part) => decodeURIComponent(part))
      .filter(
        (part) =>
          /[a-z]{3}/i.test(part) &&
          !/^(dp|p|product|products|item|items)$/i.test(part),
      )
      .at(-1);
    const words = segment
      ?.replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!words) return "";
    return (words[0].toUpperCase() + words.slice(1)).slice(
      0,
      ITEM_LIMITS.title,
    );
  } catch {
    return "";
  }
}

// A new item from the composer: a name, maybe a link, maybe Want most. Nothing is read from
// the shop; the rest is added later in the item panel.
export function newItemInput({
  title,
  url,
  starred,
}: {
  title: string;
  url?: string;
  starred: boolean;
}): Partial<ItemInput> {
  return {
    title: title.trim().slice(0, ITEM_LIMITS.title),
    ...(url && { url }),
    ...(starred && { starred: true }),
  };
}
