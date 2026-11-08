// Item URLs are typed by the list owner, so only real web links are made clickable.
// Items may have no link at all.
export function safeHref(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : undefined;
  } catch {
    return undefined;
  }
}

// "fnac.pt"; "" for an item without a link
export function siteName(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
