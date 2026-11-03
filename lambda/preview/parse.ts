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

const TITLE_SEPARATORS = [" | ", " - ", " – ", " — ", " : ", " · "];

// Letters and digits only, without accents, for comparing names: "El Corte Inglés" → "elcorteingles"
function squash(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// The shop's brand from its domain: "www.fnac.pt" → "fnac", "uk.burberry.com" → "burberry",
// "www2.hm.com" → "hm", "smile.amazon.co.uk" → "amazon"
function shopLabel(url: URL) {
  const labels = url.hostname.split(".");
  // Country domains such as .co.uk and .com.br have two parts
  const twoPartSuffix =
    labels.length > 2 &&
    labels.at(-1)!.length === 2 &&
    ["co", "com", "net", "org", "ac", "gov"].includes(labels.at(-2)!);
  const label = labels.at(twoPartSuffix ? -3 : -2);
  return label && squash(label) ? squash(label) : undefined;
}

// Shop names declared by pages vary ("Burberry United Kingdom", "Allbirds UK", none at all),
// so the vendor comes from the domain, spelled the way the page spells it when one of its
// names starts with it: "elcorteingles" → "El Corte Inglés", "hm" → "H&M"
export function vendorFromUrl(url: URL, ...pageNames: (string | undefined)[]) {
  const label = shopLabel(url);
  if (!label) return undefined;
  for (const name of pageNames) {
    for (let end = 1; name && end <= name.length; end++) {
      const start = squash(name.slice(0, end));
      if (start === label) return name.slice(0, end).trim();
      if (!label.startsWith(start)) break;
    }
  }
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Whether a piece of a title is about the shop. Short brands ("hm") must start it, since
// they turn up inside other words.
function mentionsShop(segment: string, shop: string) {
  const squashed = squash(segment);
  return shop.length >= 4 ? squashed.includes(shop) : squashed.startsWith(shop);
}

// Page titles often end with the shop's name, e.g. "Check Cashmere Scarf | Burberry® Official".
// A trailing segment is dropped only when it mentions the shop, so product names that
// contain a separator themselves are left alone.
function stripShopName(title: string | undefined, url: URL) {
  if (!title) return title;
  const shop = shopLabel(url);
  if (!shop) return title;

  for (const separator of TITLE_SEPARATORS) {
    const index = title.lastIndexOf(separator);
    if (index > 0 && mentionsShop(title.slice(index), shop)) {
      // Again, for titles like "Bonsai Tree | LEGO® Icons | Official LEGO® Shop GB"
      return stripShopName(title.slice(0, index).trim(), url);
    }
  }
  return title;
}

// "Apple (UK)", "IKEA", "Amazon.co.uk": the shop's own name, which is all some pages say
// before their script fills them in. It says nothing about the product.
function isShopName(title: string, url: URL) {
  return (
    squash(title.replace(/\(.*?\)|\.[a-z]{2,3}\b/gi, "")) === shopLabel(url)
  );
}

// Marketplace titles pile specs onto the name: "Parker IM Fountain Pen | Matte Blue | Medium Nib
// & Blue Ink Refill | Gift Boxed". Long titles keep only the part before the first separator,
// as long as that part is a name on its own; the owner can still edit the result.
const LONG_TITLE_LENGTH = 60;
const MIN_SHORT_TITLE_LENGTH = 15;
const SPEC_SEPARATORS = [" | ", ", ", " - ", " – ", " — "];

function shortenTitle(title: string | undefined) {
  if (!title || title.length <= LONG_TITLE_LENGTH) return title;

  const cuts = SPEC_SEPARATORS.map((separator) => title.indexOf(separator))
    .filter((index) => index >= MIN_SHORT_TITLE_LENGTH)
    .sort((a, b) => a - b);
  return cuts.length > 0 ? title.slice(0, cuts[0]).trim() : title;
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

function findProduct(node: unknown, type: string): JsonObject | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findProduct(child, type);
      if (found) return found;
    }
    return undefined;
  }
  if (node && typeof node === "object") {
    const object = node as JsonObject;
    if ([object["@type"]].flat().includes(type)) {
      return object;
    }
    return findProduct(object["@graph"], type);
  }
  return undefined;
}

// A Product, or else a ProductGroup (one product in several colours or sizes). Pages with
// both describe the colour or size the link points to as the Product.
function jsonLdProduct(html: string): JsonObject | undefined {
  const blocks: unknown[] = [];
  for (const [, json] of html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      blocks.push(JSON.parse(json));
    } catch {
      // Malformed JSON-LD is common; try the next block
    }
  }
  return findProduct(blocks, "Product") ?? findProduct(blocks, "ProductGroup");
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
  // A ProductGroup names the product without its colour, and keeps its prices on its
  // variants. The page's Open Graph tags describe the variant the link points to, so they
  // come first, and the group only adds a price.
  const group = [product?.["@type"]].flat().includes("ProductGroup");
  const variants = product?.hasVariant;
  const variant = (Array.isArray(variants) ? variants[0] : variants) as
    JsonObject | undefined;
  const offers = product?.offers ?? variant?.offers;
  const offer = (Array.isArray(offers) ? offers[0] : offers) as
    JsonObject | undefined;

  const pageTitle = cleanText(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1],
  );
  const productName =
    typeof product?.name === "string" ? product.name : undefined;
  // The first name that is more than just the shop's
  const title = (
    group
      ? [meta.get("og:title"), productName, pageTitle]
      : [productName, meta.get("og:title"), pageTitle]
  )
    .map((name) => stripShopName(cleanText(name), base))
    .find((name) => name && !isShopName(name, base));
  // "BAGGEBO estante, branco - IKEA" → "IKEA"
  const titleEnd = pageTitle
    ?.split(/ [|·–—-] /)
    .slice(1)
    .at(-1);

  return {
    title: truncateTitle(shortenTitle(title)),
    imageUrl: [
      group ? undefined : firstImage(product?.image),
      meta.get("og:image:secure_url"),
      meta.get("og:image"),
      firstImage(product?.image ?? variant?.image),
    ]
      .map((image) => cleanImageUrl(image, base))
      .find(Boolean),
    vendor: vendorFromUrl(base, cleanText(meta.get("og:site_name")), titleEnd),
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
  // The buy box's own price data comes first: on book pages the core price block starts
  // with a blank price, followed by the recommended retail price rather than the actual one
  const buyBoxPrice = match(
    /"desktop_buybox_group_1":\[\{"displayPrice":"([^"]+)"/,
  );

  return {
    title: truncateTitle(
      shortenTitle(
        cleanText(match(/id="productTitle"[^>]*>([\s\S]*?)<\/span>/)),
      ),
    ),
    imageUrl: cleanImageUrl(
      match(/id="landingImage"[^>]*data-old-hires="([^"]+)"/) ??
        match(/"hiRes":"(https:[^"]+)"/) ??
        match(/id="landingImage"[^>]*src="([^"]+)"/),
      base,
    ),
    price: cleanText(
      buyBoxPrice ??
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

      // Drop leading article codes, e.g. El Corte Inglés' "A51380732-conjunto-de-2-frigideiras"
      while (words.length > 0 && /^[a-z]{1,3}\d{4,}$/i.test(words[0])) {
        words.shift();
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

// The words shared or pasted along with the link: a shop app's "Kindle Paperwhite
// https://amzn.eu/d/abc", or the page title a phone's browser shares. They come from the
// owner's own device, so they are there even when the shop blocks the preview.
export function nameFromText(text: string | undefined, url: URL) {
  const words = cleanText(text?.replace(/\S*https?:\/\/\S+/g, " "))?.replace(
    /^["'“”‘’«»]+|["'“”‘’«»]+$/g,
    "",
  );
  if (!words) return undefined;

  // A leading shop name, as in "Amazon.es: Kindle Paperwhite"
  const prefix = words.match(/^(.{1,40}?)(?::| [|·–—-]) (.+)$/);
  const name = stripShopName(
    prefix && isShopName(prefix[1], url) ? prefix[2] : words,
    url,
  );

  if (!name || !/\p{L}{2}/u.test(name) || isShopName(name, url)) {
    return undefined;
  }
  return truncateTitle(shortenTitle(name));
}
