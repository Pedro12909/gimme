import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// The URL comes from a user, so this guards against server-side request forgery: only public
// http(s) addresses are fetched. Without it, a link could point the Lambda at internal endpoints
// such as the Lambda runtime API on 127.0.0.1.

const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 5;
// Amazon product pages are ~2 MB; everything we need is well within this
const MAX_BYTES = 4 * 1024 * 1024;

const HEADERS = {
  // A plain bot user agent gets blocked by most shops, Amazon included
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-GB,en;q=0.9",
};

export class FetchRefused extends Error {}

function isPrivateIPv4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, including cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast and reserved
  );
}

function isPrivateAddress(ip: string) {
  if (isIP(ip) === 4) {
    return isPrivateIPv4(ip);
  }

  const v6 = ip.toLowerCase();
  const mappedV4 = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedV4) {
    return isPrivateIPv4(mappedV4);
  }

  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") || // unique local
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") // link-local
  );
}

async function assertPublic(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchRefused(`Unsupported protocol ${url.protocol}`);
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true });

  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new FetchRefused(`Refusing to fetch private address for ${host}`);
  }
}

async function readCapped(response: Response): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);

  return new TextDecoder().decode(Buffer.concat(chunks));
}

// Follows redirects by hand so every hop is checked, not just the first URL
export async function safeFetchHtml(
  rawUrl: string,
): Promise<{ html: string; finalUrl: URL; status: number }> {
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let url = new URL(rawUrl);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);

    const response = await fetch(url, {
      headers: HEADERS,
      redirect: "manual",
      signal,
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel();
      url = new URL(location, url);
      continue;
    }

    return {
      html: await readCapped(response),
      finalUrl: url,
      status: response.status,
    };
  }

  throw new FetchRefused("Too many redirects");
}
