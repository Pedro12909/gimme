import { POSITION_PATTERN } from "../shared/item-order";

// Validation and normalisation for item create/update bodies. Optional fields can be cleared
// with "" (strings) or [] (lists); the handler turns those into attribute removals.

const LIMITS = {
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

type Result = { error: string } | { fields: Record<string, unknown> };

const isWebLink = (value: string, protocols: string[]) => {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

// "€1.234,56", "£450.00", "US$675.00", "EUR32.81" → a number, for sorting by price.
// The last separator followed by 1-2 digits is the decimal point; others are thousands.
export function parsePrice(price: string): number | undefined {
  let digits = price.replace(/\s/g, "").match(/\d[\d.,]*/)?.[0];
  if (!digits) return undefined;

  const lastComma = digits.lastIndexOf(",");
  const lastDot = digits.lastIndexOf(".");
  const decimalAt = Math.max(lastComma, lastDot);
  const isDecimal =
    decimalAt >= 0 && /^[.,]\d{1,2}$/.test(digits.slice(decimalAt));

  if (isDecimal) {
    digits =
      digits.slice(0, decimalAt).replace(/[.,]/g, "") +
      "." +
      digits.slice(decimalAt + 1);
  } else {
    digits = digits.replace(/[.,]/g, "");
  }

  const value = Number(digits);
  return Number.isFinite(value) ? value : undefined;
}

function text(
  body: Record<string, unknown>,
  field: string,
  max: number,
): string | undefined | { error: string } {
  const value = body[field];
  if (value === undefined) return undefined;
  if (typeof value !== "string") return { error: `${field} must be a string` };
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { error: `${field} must be at most ${max} characters` };
  }
  return trimmed;
}

function list(
  body: Record<string, unknown>,
  field: string,
): string[] | undefined | { error: string } {
  const value = body[field];
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    return { error: `${field} must be a list of strings` };
  }
  return value.map((entry: string) => entry.trim()).filter(Boolean);
}

export function readItemInput(
  body: Record<string, unknown>,
  mode: "create" | "update",
): Result {
  const fields: Record<string, unknown> = {};

  // Link: required on create; guests open it, so only http(s)
  const url = text(body, "url", LIMITS.url);
  if (typeof url === "object") return url;
  if (url !== undefined || mode === "create") {
    if (!url || !isWebLink(url, ["http:", "https:"])) {
      return { error: "url must be an http or https link" };
    }
    fields.url = url;
  }

  for (const [field, max] of [
    ["title", LIMITS.title],
    ["note", LIMITS.note],
    ["vendor", LIMITS.vendor],
    ["size", LIMITS.size],
  ] as const) {
    const value = text(body, field, max);
    if (typeof value === "object") return value;
    if (value !== undefined) fields[field] = value;
  }

  // Image: shown to guests on an https page, so https only
  const imageUrl = text(body, "imageUrl", LIMITS.url);
  if (typeof imageUrl === "object") return imageUrl;
  if (imageUrl !== undefined) {
    if (imageUrl !== "" && !isWebLink(imageUrl, ["https:"])) {
      return { error: "imageUrl must be an https link" };
    }
    fields.imageUrl = imageUrl;
  }

  // Price: kept as typed for display, plus a number for sorting
  const price = text(body, "price", LIMITS.price);
  if (typeof price === "object") return price;
  if (price !== undefined) {
    fields.price = price;
    fields.priceValue = (price && parsePrice(price)) ?? "";
  }

  const alternatives = list(body, "alternatives");
  if (alternatives && "error" in alternatives) return alternatives;
  if (alternatives !== undefined) {
    if (alternatives.length > LIMITS.alternatives) {
      return {
        error: `alternatives can have at most ${LIMITS.alternatives} links`,
      };
    }
    if (
      alternatives.some(
        (link) =>
          link.length > LIMITS.url || !isWebLink(link, ["http:", "https:"]),
      )
    ) {
      return { error: "alternatives must be http or https links" };
    }
    fields.alternatives = [...new Set(alternatives)];
  }

  const tags = list(body, "tags");
  if (tags && "error" in tags) return tags;
  if (tags !== undefined) {
    // One spelling per tag: "Vinyl" and "vinyl" are the same tag, the first spelling wins
    const unique = new Map<string, string>();
    for (const tag of tags) {
      const normalised = tag.replace(/\s+/g, " ");
      if (normalised.length > LIMITS.tag) {
        return { error: `tags must be at most ${LIMITS.tag} characters` };
      }
      const key = normalised.toLowerCase();
      if (!unique.has(key)) unique.set(key, normalised);
    }
    if (unique.size > LIMITS.tags) {
      return { error: `an item can have at most ${LIMITS.tags} tags` };
    }
    fields.tags = [...unique.values()];
  }

  // Owner-only flags: "really want this" and "got it" (bought or received). Stored only when
  // true; false becomes "", which is removed like any cleared field.
  for (const field of ["starred", "got"] as const) {
    const value = body[field];
    if (value === undefined) continue;
    if (typeof value !== "boolean") {
      return { error: `${field} must be true or false` };
    }
    fields[field] = value ? true : "";
  }

  // Position: only set by reordering; new items always go to the bottom
  if (mode === "update" && body.position !== undefined) {
    if (
      typeof body.position !== "string" ||
      !POSITION_PATTERN.test(body.position)
    ) {
      return { error: "position is invalid" };
    }
    fields.position = body.position;
  }

  return { fields };
}

// Cleared optional fields ("" or []) are removed instead of stored
export const isCleared = (value: unknown) =>
  value === "" || (Array.isArray(value) && value.length === 0);
