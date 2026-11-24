import { Hono, type Context } from "hono";
import type { AppEnv } from "../lib/session";
import { SERIES_ID, seriesCoverUpstream } from "../lib/weebcentral";
import { checkRateLimit } from "../lib/rate-limit";
import { clientAddress, edgeAddress } from "../lib/client-ip";

const CACHE_SECONDS = 86_400;
const EDGE_CACHE_SECONDS = 604_800;
const VISITOR_LIMIT = 60;
const SOURCE_LIMIT = 300;
const WINDOW_SECONDS = 60;

type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

function edgeCache(): EdgeCache | null {
  if (typeof caches === "undefined") return null;
  return (caches as unknown as { default?: EdgeCache }).default ?? null;
}

function tooMany(c: Context<AppEnv>, retryAfter: number) {
  c.header("Retry-After", String(retryAfter));
  c.header("Cache-Control", "no-store");
  return c.body(null, 429);
}

export const coverRoutes = new Hono<AppEnv>();

/**
 * Weebcentral's image host challenges datacenter clients, so Discord could not
 * fetch the cover and posted an image-less embed. Proxying it through the origin
 * Discord already fetches fixes that, and the cache keeps repeat hits upstream-free.
 */
coverRoutes.get("/cover/:file", async (c) => {
  const file = c.req.param("file");
  const externalId = file.endsWith(".jpg") ? file.slice(0, -4) : file;
  if (!SERIES_ID.test(externalId)) return c.body(null, 404);

  // Keyed by path, so a query string cannot turn one image into unlimited fetches.
  const cacheUrl = new URL(c.req.url);
  cacheUrl.search = "";
  const cache = edgeCache();
  const cacheKey = new Request(cacheUrl, { method: "GET" });
  const hit = await cache?.match(cacheKey);
  if (hit) return hit;

  const headers = c.req.raw.headers;
  const visitor = await checkRateLimit(
    c.env.DB,
    `cover:${clientAddress(headers, c.env.PUBLIC_URL)}`,
    VISITOR_LIMIT,
    WINDOW_SECONDS,
  );
  if (!visitor.allowed) return tooMany(c, visitor.retryAfter);

  // A forged forwarded chain can mint visitor buckets, so cap the address
  // Cloudflare actually saw as well.
  const source = await checkRateLimit(
    c.env.DB,
    `cover-src:${edgeAddress(headers)}`,
    SOURCE_LIMIT,
    WINDOW_SECONDS,
  );
  if (!source.allowed) return tooMany(c, source.retryAfter);

  const upstream = await fetch(seriesCoverUpstream(externalId), {
    headers: {
      accept: "image/*",
      "user-agent": "ChapterPing/0.1 (+https://github.com/raYhanryd/chapter-ping)",
    },
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);

  const type = upstream?.headers.get("content-type") ?? "";
  if (!upstream?.ok || !upstream.body || !type.startsWith("image/")) {
    return c.body(null, 404);
  }

  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": `public, max-age=${CACHE_SECONDS}, s-maxage=${EDGE_CACHE_SECONDS}`,
    },
  });

  // A cache failure must not turn a good cover into an error response.
  if (cache) await cache.put(cacheKey, response.clone()).catch(() => undefined);
  return response;
});
