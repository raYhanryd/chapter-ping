import { Hono } from "hono";
import { ACTIVITY_RETENTION_DAYS } from "../../shared/constants";
import type { AppEnv } from "../lib/session";
import { requireUser } from "../lib/session";
import { ApiError } from "../lib/errors";
import { noStore } from "../lib/security";

export const activityRoutes = new Hono<AppEnv>();

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 50;

interface ActivityRow {
  id: string;
  status: string;
  attempts: number;
  last_error: string | null;
  sent_at: string | null;
  created_at: string;
  activity_at: string;
  chapter_id: string;
  chapter_number: number;
  chapter_label: string;
  chapter_title: string;
  chapter_url: string;
  series_id: string;
  series_title: string;
  destination_id: string;
  destination_label: string;
}

function readLimit(raw: string | undefined): number {
  if (raw === undefined || raw === "") return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw)) throw new ApiError("VALIDATION_ERROR", "Limit must be a number.", 400, "limit");
  return Math.min(Math.max(Number(raw), 1), MAX_LIMIT);
}

function readCursor(raw: string | undefined): { time: string; id: string } | null {
  if (!raw) return null;
  const separator = raw.indexOf("|");
  const time = separator === -1 ? "" : raw.slice(0, separator);
  const id = separator === -1 ? "" : raw.slice(separator + 1);
  if (!time || !id || Number.isNaN(new Date(time).getTime())) {
    throw new ApiError("VALIDATION_ERROR", "That activity cursor is not valid.", 400, "cursor");
  }
  return { time, id };
}

activityRoutes.get("/activity", async (c) => {
  const user = requireUser(c);
  noStore(c);

  const limit = readLimit(c.req.query("limit"));
  const cursor = readCursor(c.req.query("cursor"));
  const cutoff = new Date(Date.now() - ACTIVITY_RETENTION_DAYS * 24 * 60 * 60_000).toISOString();

  const conditions = ["dst.user_id = ?", "d.created_at >= ?"];
  const values: unknown[] = [user.id, cutoff];
  if (cursor) {
    conditions.push(
      "(COALESCE(d.sent_at, d.created_at) < ? OR (COALESCE(d.sent_at, d.created_at) = ? AND d.id < ?))",
    );
    values.push(cursor.time, cursor.time, cursor.id);
  }
  values.push(limit + 1);

  const rows = await c.env.DB.prepare(
    `SELECT d.id, d.status, d.attempts, d.last_error, d.sent_at, d.created_at,
            COALESCE(d.sent_at, d.created_at) AS activity_at,
            ch.id AS chapter_id, ch.chapter_number, ch.chapter_label, ch.title AS chapter_title, ch.url AS chapter_url,
            se.id AS series_id, se.title AS series_title,
            dst.id AS destination_id, dst.label AS destination_label
     FROM deliveries d
     JOIN chapters ch ON ch.id = d.chapter_id
     JOIN series se ON se.id = ch.series_id
     JOIN destinations dst ON dst.id = d.destination_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY activity_at DESC, d.id DESC
     LIMIT ?`,
  )
    .bind(...values)
    .all<ActivityRow>();

  const found = rows.results ?? [];
  const items = found.slice(0, limit).map((row) => ({
    id: row.id,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    chapter: {
      id: row.chapter_id,
      number: row.chapter_number,
      label: row.chapter_label,
      title: row.chapter_title,
      url: row.chapter_url,
    },
    series: { id: row.series_id, title: row.series_title },
    destination: { id: row.destination_id, label: row.destination_label },
  }));

  const last = items.at(-1);
  return c.json({
    items,
    ...(found.length > limit && last ? { nextCursor: `${last.sentAt ?? last.createdAt}|${last.id}` } : {}),
  });
});
