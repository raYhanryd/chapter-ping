import { Hono } from "hono";
import type { AppEnv } from "../lib/session";
import { SERIES_ID, seriesCoverUpstream } from "../lib/weebcentral";

const CACHE_SECONDS = 86_400;
const EDGE_CACHE_SECONDS = 604_800;

type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

function edgeCache(): EdgeCache | null {
  if (typeof caches === "undefined") return null;
  return (caches as unknown as { default?: EdgeCache }).default ?? null;
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

  const cache = edgeCache();
  const cacheKey = new Request(c.req.url, { method: "GET" });
  const hit = await cache?.match(cacheKey);
  if (hit) return hit;

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

  await cache?.put(cacheKey, response.clone());
  return response;
});
