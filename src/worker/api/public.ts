import { Hono } from "hono";
import type { AppEnv } from "../lib/session";
import { ApiError } from "../lib/errors";
import { checkRateLimit } from "../lib/rate-limit";
import { coverPath } from "../lib/weebcentral";
import { clientAddress } from "../lib/client-ip";
import { publicOrigin } from "../lib/env";

const LOOKUP_LIMIT = 60;
const LOOKUP_WINDOW_SECONDS = 60;

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

/** Read-only series data for the shareable page. No session required. */
publicRoutes.get("/public/series/:id", async (c) => {
  const ip = clientAddress(c.req.raw.headers);
  const limit = await checkRateLimit(c.env.DB, `public-series:${ip}`, LOOKUP_LIMIT, LOOKUP_WINDOW_SECONDS);
  if (!limit.allowed) {
    c.header("Retry-After", String(limit.retryAfter));
    throw new ApiError("RATE_LIMITED", "Too many requests. Wait a moment and try again.", 429);
  }

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
