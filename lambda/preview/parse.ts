// Pulls a product name, image and price out of a shop's HTML. Amazon pages have little
// standard metadata, so they get their own parser; everything else uses JSON-LD
// (schema.org Product), Open Graph tags and finally the page <title>.

export type Preview = {
  title?: string;
  imageUrl?: string;
  price?: string;
  vendor?: string;
};

// Matches the owner Lambda's item title limit
const MAX_TITLE_LENGTH = 200;

const ENTITIES: Record<string, string> = {
  amp: "&",
  quot: '"',
  apos: "'",
  lt: "<",
  gt: ">",
  nbsp: " ",
};

function decodeEntities(text: string) {
  return text.replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const value =
        code[1].toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isNaN(value) ? match : String.fromCodePoint(value);
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function cleanText(text: string | undefined) {
  if (!text) return undefined;
  const cleaned = decodeEntities(text.replace(/<[^>]+>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || undefined;
}

const TITLE_SEPARATORS = [" | ", " - ", " – ", " — ", " : "];

// Page titles often end with the shop's name, e.g. "Check Cashmere Scarf | Burberry® Official".
// A trailing segment is dropped only when it mentions the shop, so product names that
// contain a separator themselves are left alone.
// The shop's brand from its domain: "www.fnac.pt" → "fnac", "uk.burberry.com" → "burberry"
function shopLabel(url: URL) {
  return url.hostname
    .replace(/^www\./, "")
    .split(".")
    .find(
      (label) =>
        label.length > 2 && !["www", "com", "shop", "store"].includes(label),
    );
}

// Shop names declared by pages vary ("Burberry United Kingdom", "Allbirds UK", none at all),
// so the vendor comes from the domain, using the page's casing when it starts with it ("IKEA")
export function vendorFromUrl(url: URL, siteName?: string) {
  const label = shopLabel(url);
  if (!label) return undefined;
  if (siteName?.toLowerCase().startsWith(label.toLowerCase())) {
    return siteName.slice(0, label.length);
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function stripShopName(title: string | undefined, url: URL) {
  if (!title) return title;
  const shop = shopLabel(url);
  if (!shop) return title;

  for (const separator of TITLE_SEPARATORS) {
    const index = title.lastIndexOf(separator);
    if (
      index > 0 &&
      title.slice(index).toLowerCase().includes(shop.toLowerCase())
    ) {
      return title.slice(0, index).trim();
    }
  }
  return title;
}

function truncateTitle(title: string | undefined) {
  if (!title || title.length <= MAX_TITLE_LENGTH) return title;
  // Cut at a word boundary so the owner gets a readable starting point
  const cut = title.slice(0, MAX_TITLE_LENGTH);
  return cut.slice(0, cut.lastIndexOf(" ")).trim() || cut;
}

// Images are shown to guests on an https page, so only https URLs are kept.
// Plain http image links are upgraded, since almost every shop CDN also serves https.
function cleanImageUrl(raw: string | undefined, base: URL) {
  if (!raw) return undefined;
  try {
    const url = new URL(decodeEntities(raw.trim()), base);
    if (url.protocol === "http:") url.protocol = "https:";
    // Fragments don't affect the image, and some shops append tracking IDs there
    url.hash = "";
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function formatPrice(amount: unknown, currency: unknown) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  if (typeof currency === "string" && /^[A-Z]{3}$/.test(currency)) {
    try {
      return new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
      }).format(value);
    } catch {
      // Unknown currency code, fall through
    }
  }
  return String(value);
}

// <meta> attributes can come in any order, so parse each tag's attributes properly
function metaTags(html: string) {
  const tags = new Map<string, string>();
  for (const [tag] of html.matchAll(/<meta\s[^>]*>/gi)) {
    const attributes: Record<string, string> = {};
    for (const [, name, , doubleQuoted, singleQuoted] of tag.matchAll(
      /([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)')/g,
    )) {
      attributes[name.toLowerCase()] = doubleQuoted ?? singleQuoted ?? "";
    }
    const key = (attributes.property ?? attributes.name)?.toLowerCase();
    if (key && attributes.content && !tags.has(key)) {
      tags.set(key, attributes.content);
    }
  }
  return tags;
}

type JsonObject = Record<string, unknown>;

function findProduct(node: unknown): JsonObject | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProduct(child);
      if (found) return found;
    }
    return undefined;
  }
  if (node && typeof node === "object") {
    const object = node as JsonObject;
    const type = object["@type"];
    if (
      type === "Product" ||
      (Array.isArray(type) && type.includes("Product"))
    ) {
      return object;
    }
    return findProduct(object["@graph"]);
  }
  return undefined;
}

function jsonLdProduct(html: string): JsonObject | undefined {
  for (const [, json] of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const product = findProduct(JSON.parse(json));
      if (product) return product;
    } catch {
      // Malformed JSON-LD is common; try the next block
    }
  }
  return undefined;
}

function firstImage(image: unknown): string | undefined {
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return firstImage(image[0]);
  if (image && typeof image === "object") {
    return firstImage((image as JsonObject).url);
  }
  return undefined;
}

function parseGeneric(html: string, base: URL): Preview {
  const meta = metaTags(html);
  const product = jsonLdProduct(html);
  const offers = product?.offers;
  const offer = (Array.isArray(offers) ? offers[0] : offers) as
    JsonObject | undefined;

  return {
    title: truncateTitle(
      stripShopName(
        cleanText(product?.name as string | undefined) ??
          cleanText(meta.get("og:title")) ??
          cleanText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]),
        base,
      ),
    ),
    imageUrl:
      cleanImageUrl(firstImage(product?.image), base) ??
      cleanImageUrl(meta.get("og:image:secure_url"), base) ??
      cleanImageUrl(meta.get("og:image"), base),
    vendor: vendorFromUrl(base, cleanText(meta.get("og:site_name"))),
    price:
      formatPrice(offer?.price ?? offer?.lowPrice, offer?.priceCurrency) ??
      formatPrice(
        meta.get("product:price:amount") ?? meta.get("og:price:amount"),
        meta.get("product:price:currency") ?? meta.get("og:price:currency"),
      ),
  };
}

function parseAmazon(html: string, base: URL): Preview {
  const match = (regex: RegExp) => html.match(regex)?.[1];

  // The main price lives in the "core price" block; the first price elsewhere on the page
  // can belong to a deal, another seller, or an accessory
  const corePriceStart = html.search(
    /id="(corePriceDisplay_desktop_feature_div|corePrice_feature_div|corePrice_desktop|apex_desktop)"/,
  );
  const priceRegion = corePriceStart >= 0 ? html.slice(corePriceStart) : html;

  return {
    title: truncateTitle(
      cleanText(match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/)),
    ),
    imageUrl: cleanImageUrl(
      match(/id="landingImage"[^>]*data-old-hires="([^"]+)"/) ??
        match(/"hiRes":"(https:[^"]+)"/) ??
        match(/id="landingImage"[^>]*src="([^"]+)"/),
      base,
    ),
    price: cleanText(
      priceRegion.match(/<span class="a-offscreen">([^<]+)<\/span>/)?.[1],
    ),
  };
}

const isAmazon = (url: URL) => /(^|\.)amazon\.[a-z.]+$/i.test(url.hostname);

export function parsePreview(html: string, finalUrl: URL): Preview {
  const generic = parseGeneric(html, finalUrl);
  if (!isAmazon(finalUrl)) {
    return generic;
  }

  // Prefer Amazon's own markup, falling back to whatever generic metadata exists
  const amazon = parseAmazon(html, finalUrl);
  return {
    title: amazon.title ?? generic.title,
    imageUrl: amazon.imageUrl ?? generic.imageUrl,
    price: amazon.price ?? generic.price,
    vendor: "Amazon",
  };
}

// Bot-protection pages served instead of the product. Some answer 200, so the status alone isn't enough.
export function looksBlocked(status: number, html: string) {
  if (status === 403 || status === 429 || status === 503) {
    return true;
  }

  return (
    // Amazon's captcha / "automated access" page
    /validateCaptcha|Type the characters you see|automated access|api-services-support@amazon/i.test(
      html,
    ) ||
    // Cloudflare's "Just a moment..." challenge
    /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(html) ||
    // Akamai Bot Manager's verification redirect, and its "bot failover" page (raw ESI tags)
    /bm-verify=|botfailover|<esi:remove>/i.test(html) ||
    // Any tiny page that immediately refreshes itself is an interstitial, not a product page
    (html.length < 10_000 && /<meta[^>]+http-equiv=["']?refresh/i.test(html))
  );
}

// Path segments that are routing, not product names
const URL_NOISE = new Set([
  "p",
  "dp",
  "gp",
  "d",
  "product",
  "products",
  "produto",
  "produtos",
  "item",
  "items",
  "shop",
  "mrkean",
]);

// Fallback when a shop blocks the request: many shops put a readable name in the link, e.g.
// zara.com/pt/pt/t-shirt-as-riscas-com-etiqueta-p04424517.html → "T-shirt as riscas com etiqueta"
export function nameFromUrl(url: URL): string | undefined {
  const candidates = url.pathname
    .split("/")
    .map((segment) => {
      let words: string[];
      try {
        words = decodeURIComponent(segment)
          .replace(/\.(html?|aspx|php)$/i, "")
          // Sephora-style "libre---eau-de-parfum" uses a triple dash as a separator
          .replace(/-{2,}/g, " – ")
          .split(/[-_+\s]+/)
          .filter(Boolean);
      } catch {
        return "";
      }

      // Drop trailing IDs and SKUs (anything with a digit at the end, e.g. "p04424517", "7721309")
      while (
        words.length > 0 &&
        (/^[a-z]{0,3}\d{4,}$/i.test(words.at(-1)!) ||
          URL_NOISE.has(words.at(-1)!.toLowerCase()) ||
          words.at(-1) === "–")
      ) {
        words.pop();
      }
      return words.join(" ");
    })
    .filter((name) => {
      const wordCount = name.split(" ").filter((word) => word !== "–").length;
      return (
        wordCount >= 2 &&
        /[a-z]{3}/i.test(name) &&
        !URL_NOISE.has(name.toLowerCase())
      );
    });

  // The most descriptive segment is usually the longest
  const best = candidates.sort((a, b) => b.length - a.length)[0];
  if (!best) return undefined;

  return truncateTitle(best.charAt(0).toUpperCase() + best.slice(1));
}
