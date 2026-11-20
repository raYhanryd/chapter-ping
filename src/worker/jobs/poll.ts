import type { Env } from "../env";
import { readConfig } from "../lib/env";
import { fetchFeed } from "../lib/feed-fetch";
import { parseFeed } from "../lib/rss";
import { sanitizeMessage } from "../lib/errors";

export interface PollResult {
  checked: number;
  chaptersFound: number;
  errors: number;
}

interface DueSeries {
  id: string;
  feed_url: string;
  latest_chapter_number: number | null;
  etag: string | null;
  last_modified: string | null;
}

const RETRY_MINUTES = 5;
const ERROR_MAX_LENGTH = 300;

export async function pollDueSeries(
  env: Env,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<PollResult> {
  const config = readConfig(env);
  const nowIso = now.toISOString();

  const due = await env.DB.prepare(
    `SELECT se.id, se.feed_url, se.latest_chapter_number, se.etag, se.last_modified
     FROM series se
     WHERE se.active = 1 AND se.next_check_at <= ?
       AND EXISTS (SELECT 1 FROM subscriptions s WHERE s.series_id = se.id AND s.active = 1)
     ORDER BY se.next_check_at
     LIMIT ?`,
  )
    .bind(nowIso, config.cronBatchSeries)
    .all<DueSeries>();

  let checked = 0;
  let chaptersFound = 0;
  let errors = 0;
  const nextCheckAt = new Date(now.getTime() + config.pollIntervalMinutes * 60_000).toISOString();
  const rows = due.results ?? [];

  // Advance every due row in one batch first so a crash cannot hot-loop a feed.
  // One batch counts as one D1 query, keeping the whole cron run inside 50.
  if (rows.length > 0) {
    await env.DB.batch(
      rows.map((series) =>
        env.DB.prepare("UPDATE series SET next_check_at = ? WHERE id = ?").bind(nextCheckAt, series.id),
      ),
    );
  }

  for (const series of rows) {
    checked += 1;

    try {
      const feed = await fetchFeed(series.feed_url, {
        etag: series.etag,
        lastModified: series.last_modified,
        fetchImpl,
      });

      if (feed.notModified) {
        await env.DB.prepare("UPDATE series SET last_checked_at = ?, last_error = NULL WHERE id = ?")
          .bind(nowIso, series.id)
          .run();
        continue;
      }

      const parsed = parseFeed(feed.xml);
      const latest = parsed.latest;

      if (series.latest_chapter_number !== null && latest.number <= series.latest_chapter_number) {
        await env.DB.prepare(
          "UPDATE series SET last_checked_at = ?, last_error = NULL, etag = ?, last_modified = ? WHERE id = ?",
        )
          .bind(nowIso, feed.etag, feed.lastModified, series.id)
          .run();
        continue;
      }

      const chapterId = crypto.randomUUID();
      await env.DB.batch([
        env.DB.prepare(
          `INSERT OR IGNORE INTO chapters
             (id, series_id, chapter_number, chapter_label, title, url, published_at, discovered_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          chapterId,
          series.id,
          latest.number,
          latest.label,
          latest.title,
          latest.url,
          latest.publishedAt,
          nowIso,
        ),
        env.DB.prepare(
          `UPDATE series SET latest_chapter_number = ?, latest_chapter_label = ?, latest_chapter_title = ?,
             latest_chapter_url = ?, latest_published_at = ?, last_checked_at = ?, last_error = NULL,
             etag = ?, last_modified = ? WHERE id = ?`,
        ).bind(
          latest.number,
          latest.label,
          latest.title,
          latest.url,
          latest.publishedAt,
          nowIso,
          feed.etag,
          feed.lastModified,
          series.id,
        ),
        env.DB.prepare(
          `INSERT OR IGNORE INTO deliveries
             (id, chapter_id, destination_id, status, attempts, created_at, updated_at)
           SELECT lower(hex(randomblob(16))), ch.id, s.destination_id, 'pending', 0, ?, ?
           FROM chapters ch
           JOIN subscriptions s ON s.series_id = ch.series_id AND s.active = 1
           WHERE ch.series_id = ? AND ch.chapter_number = ?`,
        ).bind(nowIso, nowIso, series.id, latest.number),
      ]);

      chaptersFound += 1;
    } catch (error) {
      errors += 1;
      const message = sanitizeMessage(error instanceof Error ? error.message : "Feed check failed.").slice(
        0,
        ERROR_MAX_LENGTH,
      );
      await env.DB.prepare("UPDATE series SET last_error = ?, next_check_at = ? WHERE id = ?")
        .bind(message, new Date(now.getTime() + RETRY_MINUTES * 60_000).toISOString(), series.id)
        .run();
    }
  }

  return { checked, chaptersFound, errors };
}
