import { Hono } from "hono";
import type { AppContext, AppEnv } from "../lib/session";
import { requireUser } from "../lib/session";
import { ApiError } from "../lib/errors";
import { assertSameOrigin } from "../lib/same-origin";
import { noStore } from "../lib/security";
import { fetchFeed } from "../lib/feed-fetch";
import { parseFeed, type ParsedFeed } from "../lib/rss";
import { parseSeriesUrl } from "../lib/weebcentral";
import { readConfig } from "../lib/env";
import { accountCount, globalActiveSeriesCount, userSeriesCount } from "../lib/capacity";
import { checkRateLimit } from "../lib/rate-limit";

export const seriesRoutes = new Hono<AppEnv>();

interface SubscriptionRow {
  subscription_id: string;
  active: number;
  destination_id: string;
  destination_label: string;
  series_id: string;
  title: string;
  site_url: string;
  latest_chapter_label: string | null;
  latest_chapter_title: string | null;
  latest_chapter_url: string | null;
  latest_published_at: string | null;
  next_check_at: string;
  last_checked_at: string | null;
  last_error: string | null;
}

const PREVIEW_LIMIT = 10;
const PREVIEW_WINDOW_SECONDS = 60;
const WRITE_LIMIT = 30;
const WRITE_WINDOW_SECONDS = 60;

async function writeLimit(c: AppContext): Promise<void> {
  const user = requireUser(c);
  const limit = await checkRateLimit(c.env.DB, `series-write:${user.id}`, WRITE_LIMIT, WRITE_WINDOW_SECONDS);
  if (!limit.allowed) {
    c.header("Retry-After", String(limit.retryAfter));
    throw new ApiError("RATE_LIMITED", "Too many changes. Wait a moment and try again.", 429);
  }
}

function addMinutes(date: Date, minutes: number): string {
  return new Date(date.getTime() + minutes * 60_000).toISOString();
}

function nextCheckAt(pollMinutes: number, now: Date): string {
  const jitterMinutes = Math.floor(Math.random() * 5);
  return addMinutes(now, pollMinutes + jitterMinutes);
}

async function loadFeed(url: string): Promise<ParsedFeed> {
  const result = await fetchFeed(url, {});
  if (result.notModified) throw new ApiError("FEED_UNAVAILABLE", "Weebcentral returned no feed. Try again.", 502);
  return parseFeed(result.xml);
}

function readString(body: unknown, key: string): string {
  if (typeof body !== "object" || body === null || !(key in body)) return "";
  const value = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

async function findSubscription(db: D1Database, userId: string, seriesId: string): Promise<{ id: string } | null> {
  return db
    .prepare("SELECT id FROM subscriptions WHERE user_id = ? AND series_id = ?")
    .bind(userId, seriesId)
    .first<{ id: string }>();
}

seriesRoutes.get("/series", async (c) => {
  const user = requireUser(c);
  noStore(c);

  const rows = await c.env.DB.prepare(
    `SELECT s.id AS subscription_id, s.active, s.destination_id,
            d.label AS destination_label,
            se.id AS series_id, se.title, se.site_url,
            se.latest_chapter_label, se.latest_chapter_title, se.latest_chapter_url, se.latest_published_at,
            se.next_check_at, se.last_checked_at, se.last_error
     FROM subscriptions s
     JOIN series se ON se.id = s.series_id
     JOIN destinations d ON d.id = s.destination_id
     WHERE s.user_id = ?
     ORDER BY se.title COLLATE NOCASE`,
  )
    .bind(user.id)
    .all<SubscriptionRow>();

  const items = (rows.results ?? []).map((row) => ({
    id: row.subscription_id,
    seriesId: row.series_id,
    title: row.title,
    siteUrl: row.site_url,
    latestChapter: row.latest_chapter_label
      ? {
          label: row.latest_chapter_label,
          title: row.latest_chapter_title,
          url: row.latest_chapter_url,
          publishedAt: row.latest_published_at,
        }
      : null,
    destination: { id: row.destination_id, label: row.destination_label },
    active: row.active === 1,
    nextCheckAt: row.next_check_at,
    lastCheckedAt: row.last_checked_at,
    lastError: row.last_error,
  }));

  return c.json({ items });
});

seriesRoutes.post("/series/preview", async (c) => {
  assertSameOrigin(c);
  const user = requireUser(c);
  noStore(c);

  const limit = await checkRateLimit(c.env.DB, `series-preview:${user.id}`, PREVIEW_LIMIT, PREVIEW_WINDOW_SECONDS);
  if (!limit.allowed) {
    c.header("Retry-After", String(limit.retryAfter));
    throw new ApiError("RATE_LIMITED", "Too many checks. Wait a moment and try again.", 429);
  }

  const body: unknown = await c.req.json().catch(() => null);
  const parsed = parseSeriesUrl(readString(body, "url"));
  const feed = await loadFeed(parsed.feedUrl);

  const existing = await c.env.DB.prepare("SELECT id FROM series WHERE source = 'weebcentral' AND external_id = ?")
    .bind(parsed.externalId)
    .first<{ id: string }>();
  const subscription = existing ? await findSubscription(c.env.DB, user.id, existing.id) : null;

  return c.json({
    series: {
      externalId: parsed.externalId,
      title: feed.title,
      siteUrl: parsed.siteUrl,
      feedUrl: parsed.feedUrl,
      latest: feed.latest,
    },
    alreadyTracked: Boolean(subscription),
  });
});

seriesRoutes.post("/series", async (c) => {
  assertSameOrigin(c);
  await writeLimit(c);
  const user = requireUser(c);
  noStore(c);

  const body: unknown = await c.req.json().catch(() => null);
  const parsed = parseSeriesUrl(readString(body, "url"));
  const destinationId = readString(body, "destinationId");
  if (!destinationId) throw new ApiError("VALIDATION_ERROR", "Choose a Discord destination.", 400, "destinationId");

  const destination = await c.env.DB.prepare(
    "SELECT id, status FROM destinations WHERE id = ? AND user_id = ?",
  )
    .bind(destinationId, user.id)
    .first<{ id: string; status: string }>();
  if (!destination) throw new ApiError("DESTINATION_NOT_FOUND", "That destination was not found.", 404, "destinationId");
  if (destination.status !== "active") {
    throw new ApiError("DESTINATION_DISABLED", "That destination is disabled. Replace its webhook first.", 409);
  }

  const config = readConfig(c.env);
  const [userSeries, globalActive, accounts] = await Promise.all([
    userSeriesCount(c.env.DB, user.id),
    globalActiveSeriesCount(c.env.DB),
    accountCount(c.env.DB),
  ]);

  if (userSeries >= config.maxSeriesPerUser) {
    throw new ApiError(
      "SERIES_LIMIT",
      `You can track ${config.maxSeriesPerUser} series on this plan. Remove one to add another.`,
      409,
    );
  }
  if (globalActive >= config.maxActiveSeries) {
    throw new ApiError("SERIES_CAPACITY_REACHED", "Tracked-series capacity is full right now. Try again later.", 409);
  }
  if (accounts >= config.maxAccounts && userSeries === 0) {
    await c.env.DB.prepare(
      "INSERT INTO waitlist (id, discord_id, username, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(discord_id) DO NOTHING",
    )
      .bind(crypto.randomUUID(), user.discordId ?? user.id, user.name, new Date().toISOString())
      .run();
    throw new ApiError("CAPACITY_REACHED", "Launch capacity is full. You are on the waitlist.", 409);
  }

  const feed = await loadFeed(parsed.feedUrl);
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = await c.env.DB.prepare(
    "SELECT id FROM series WHERE source = 'weebcentral' AND external_id = ?",
  )
    .bind(parsed.externalId)
    .first<{ id: string }>();

  if (existing && (await findSubscription(c.env.DB, user.id, existing.id))) {
    throw new ApiError("SERIES_ALREADY_TRACKED", "You already track this series.", 409);
  }

  // The conflict clauses make a concurrent add converge on one series and one
  // subscription instead of failing on the unique indexes.
  const seriesId = existing?.id ?? crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO series (id, source, external_id, title, feed_url, site_url,
      latest_chapter_number, latest_chapter_label, latest_chapter_title, latest_chapter_url, latest_published_at,
      next_check_at, active, created_at, updated_at)
     VALUES (?, 'weebcentral', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
     ON CONFLICT(source, external_id) DO NOTHING`,
  )
    .bind(
      seriesId,
      parsed.externalId,
      feed.title,
      parsed.feedUrl,
      parsed.siteUrl,
      feed.latest.number,
      feed.latest.label,
      feed.latest.title,
      feed.latest.url,
      feed.latest.publishedAt,
      nextCheckAt(config.pollIntervalMinutes, now),
      nowIso,
      nowIso,
    )
    .run();

  let id = seriesId;
  if (!existing) {
    const row = await c.env.DB.prepare(
      "SELECT id FROM series WHERE source = 'weebcentral' AND external_id = ?",
    )
      .bind(parsed.externalId)
      .first<{ id: string }>();
    if (!row) throw new ApiError("INTERNAL_ERROR", "Something went wrong. Try again.", 500);
    id = row.id;
  }

  await c.env.DB.prepare("UPDATE series SET active = 1, next_check_at = ?, updated_at = ? WHERE id = ?")
    .bind(nextCheckAt(config.pollIntervalMinutes, now), nowIso, id)
    .run();

  const subscription = await c.env.DB.prepare(
    "INSERT INTO subscriptions (id, user_id, series_id, destination_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, series_id) DO NOTHING",
  )
    .bind(crypto.randomUUID(), user.id, id, destinationId, nowIso, nowIso)
    .run();
  if (subscription.meta.changes === 0) {
    throw new ApiError("SERIES_ALREADY_TRACKED", "You already track this series.", 409);
  }

  if (existing) {
    return c.json({ series: { id, title: feed.title, latest: feed.latest } }, 201);
  }

  return c.json(
    {
      series: {
        id,
        title: feed.title,
        siteUrl: parsed.siteUrl,
        latest: feed.latest,
        baseline: true,
      },
    },
    201,
  );
});

seriesRoutes.patch("/series/:id", async (c) => {
  assertSameOrigin(c);
  await writeLimit(c);
  const user = requireUser(c);
  noStore(c);

  const body: unknown = await c.req.json().catch(() => null);
  const active = typeof body === "object" && body !== null ? (body as Record<string, unknown>).active : undefined;
  if (typeof active !== "boolean") {
    throw new ApiError("VALIDATION_ERROR", "Send active true or false.", 400, "active");
  }

  const existing = await c.env.DB.prepare("SELECT series_id FROM subscriptions WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .first<{ series_id: string }>();
  if (!existing) throw new ApiError("NOT_FOUND", "That series was not found.", 404);

  const nowIso = new Date().toISOString();
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE subscriptions SET active = ?, updated_at = ? WHERE id = ? AND user_id = ?").bind(
      active ? 1 : 0,
      nowIso,
      c.req.param("id"),
      user.id,
    ),
    // A paused series may have been deactivated when its last subscriber left.
    ...(active
      ? [c.env.DB.prepare("UPDATE series SET active = 1, updated_at = ? WHERE id = ?").bind(nowIso, existing.series_id)]
      : []),
  ]);

  return c.json({ subscription: { id: c.req.param("id"), active } });
});

seriesRoutes.delete("/series/:id", async (c) => {
  assertSameOrigin(c);
  const user = requireUser(c);
  noStore(c);

  const row = await c.env.DB.prepare("SELECT series_id FROM subscriptions WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .first<{ series_id: string }>();
  if (!row) throw new ApiError("NOT_FOUND", "That series was not found.", 404);

  await c.env.DB.prepare("DELETE FROM subscriptions WHERE id = ? AND user_id = ?")
    .bind(c.req.param("id"), user.id)
    .run();

  const remaining = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM subscriptions WHERE series_id = ? AND active = 1",
  )
    .bind(row.series_id)
    .first<{ count: number }>();
  if ((remaining?.count ?? 0) === 0) {
    await c.env.DB.prepare("UPDATE series SET active = 0, updated_at = ? WHERE id = ?")
      .bind(new Date().toISOString(), row.series_id)
      .run();
  }

  return c.body(null, 204);
});

