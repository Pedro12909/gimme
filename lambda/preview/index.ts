import { Hono } from "hono";
import {
  ApiGatewayRequestContextV2,
  handle,
  LambdaContext,
} from "hono/aws-lambda";
import {
  looksBlocked,
  nameFromText,
  nameFromUrl,
  parsePreview,
  vendorFromUrl,
} from "./parse";
import { FetchRefused, safeFetchHtml } from "./safe-fetch";

// Link preview for owners adding an item: fetches the page and returns its name, image and
// price. It has no database access; the owner saves the result along with the item.

type Bindings = {
  requestContext: ApiGatewayRequestContextV2;
  lambdaContext: LambdaContext;
};

const app = new Hono<{ Bindings: Bindings }>();

// The API Gateway authorizer already requires a signed-in owner; this is a second check
app.use("*", async (ctx, next) => {
  if (!ctx.env.requestContext.authorizer.jwt?.claims.sub) {
    return ctx.json({ error: "Unauthorized" }, 401);
  }
  return next();
});

app.post("/preview", async (ctx) => {
  const body = await ctx.req.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url.trim() : "";

  // Optional: the words shared or pasted along with the link
  const text =
    typeof body?.text === "string" ? body.text.slice(0, 1000) : undefined;

  if (!url || url.length > 2048) {
    return ctx.json({ error: "url is required" }, 400);
  }

  // When the page can't be read or has no name: the shared words, then the link itself
  const fallbackTitle = (finalUrl: URL) =>
    nameFromText(text, finalUrl) ?? nameFromUrl(finalUrl);

  const fallback = (finalUrl: URL, error: string, status: 502 | 504) => {
    const title = fallbackTitle(finalUrl);
    return title
      ? ctx.json({ title, vendor: vendorFromUrl(finalUrl) })
      : ctx.json({ error }, status);
  };

  try {
    const { html, finalUrl, status } = await safeFetchHtml(url);

    if (looksBlocked(status, html)) {
      // Which shops turn the Lambda away, for CloudWatch. Only the host: the rest of the
      // link would show what's on someone's list.
      console.warn("Shop blocked the preview", {
        host: finalUrl.hostname,
        status,
      });
      return fallback(finalUrl, "The shop blocked the request", 502);
    }
    if (status >= 400) {
      return fallback(finalUrl, `The shop responded with ${status}`, 502);
    }

    const preview = parsePreview(html, finalUrl);
    return ctx.json({
      ...preview,
      title: preview.title ?? fallbackTitle(finalUrl),
    });
  } catch (err) {
    if (err instanceof FetchRefused) {
      // Private address or unsupported protocol: refused outright, no fallback
      return ctx.json({ error: "Couldn't fetch that link" }, 422);
    }
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return fallback(new URL(url), "The shop took too long to respond", 504);
    }
    if (err instanceof TypeError) {
      // Invalid URL or a network failure
      return URL.canParse(url)
        ? fallback(new URL(url), "Couldn't fetch that link", 502)
        : ctx.json({ error: "Couldn't fetch that link" }, 422);
    }
    throw err;
  }
});

export const handler = handle(app);
