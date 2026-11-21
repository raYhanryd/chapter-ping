import { Hono, type Context } from "hono";
import type { AppEnv } from "../lib/session";
import { ApiError } from "../lib/errors";
import { checkRateLimit } from "../lib/rate-limit";
import { coverPath } from "../lib/weebcentral";
import { clientAddress, edgeAddress } from "../lib/client-ip";
import { publicOrigin } from "../lib/env";

const VISITOR_LIMIT = 60;
const SOURCE_LIMIT = 300;
const WINDOW_SECONDS = 60;

interface PublicSeriesRow {
  id: string;
  external_id: string;
  title: string;
  site_url: string;
  latest_chapter_label: string | null;
  latest_chapter_title: string | null;
  latest_chapter_url: string | null;
  latest_published_at: string | null;
}

export const publicRoutes = new Hono<AppEnv>();

function rateLimited(c: Context<AppEnv>, retryAfter: number): never {
  c.header("Retry-After", String(retryAfter));
  throw new ApiError("RATE_LIMITED", "Too many requests. Wait a moment and try again.", 429);
}

/** Read-only series data for the shareable page. No session required. */
publicRoutes.get("/public/series/:id", async (c) => {
  const headers = c.req.raw.headers;
  const visitor = await checkRateLimit(
    c.env.DB,
    `public-series:${clientAddress(headers, c.env.PUBLIC_URL)}`,
    VISITOR_LIMIT,
    WINDOW_SECONDS,
  );
  if (!visitor.allowed) rateLimited(c, visitor.retryAfter);

  // A forged forwarded chain can mint visitor buckets, so cap the address
  // Cloudflare actually saw as well.
  const source = await checkRateLimit(
    c.env.DB,
    `public-series-src:${edgeAddress(headers)}`,
    SOURCE_LIMIT,
    WINDOW_SECONDS,
  );
  if (!source.allowed) rateLimited(c, source.retryAfter);

  const row = await c.env.DB.prepare(
    `SELECT id, external_id, title, site_url, latest_chapter_label, latest_chapter_title,
            latest_chapter_url, latest_published_at
     FROM series WHERE id = ?`,
  )
    .bind(c.req.param("id"))
    .first<PublicSeriesRow>();
  if (!row) throw new ApiError("NOT_FOUND", "That series was not found.", 404);

  c.header("Cache-Control", "public, max-age=60");
  return c.json({
    series: {
      id: row.id,
      title: row.title,
      coverUrl: `${publicOrigin(c.env)}${coverPath(row.external_id)}`,
      siteUrl: row.site_url,
      latestChapter: row.latest_chapter_label
        ? {
            label: row.latest_chapter_label,
            title: row.latest_chapter_title,
            url: row.latest_chapter_url,
            publishedAt: row.latest_published_at,
          }
        : null,
    },
  });
});
