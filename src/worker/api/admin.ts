import { Hono } from "hono";
import { requireAdmin } from "../lib/admin";
import { noStore } from "../lib/security";
import type { AppEnv } from "../lib/session";

export const adminRoutes = new Hono<AppEnv>();

const DAY_MS = 86_400_000;
/** The cron runs every 5 minutes; 15 means three missed ticks. */
const CRON_STALE_MS = 15 * 60_000;
const USER_LIST_LIMIT = 200;

interface TotalsRow {
  users: number;
  new_users: number;
  waitlist: number;
  active_subscriptions: number;
  subscriptions: number;
  active_series: number;
  series: number;
  series_errors: number;
  chapters: number;
  active_destinations: number;
  disabled_destinations: number;
  destinations: number;
  pending: number;
  retry: number;
  sent_total: number;
  failed_total: number;
  last_run_at: string | null;
}

interface UserRow {
  id: string;
  name: string;
  created_at: number;
  discord_id: string | null;
  series_active: number;
  series_total: number;
  destinations: number;
  last_seen_at: number | null;
  waitlisted: number;
}

interface TopSeriesRow {
  id: string;
  title: string;
  subscribers: number;
}

interface RunRow {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  feeds_checked: number;
  chapters_found: number;
  deliveries_sent: number;
  errors: number;
  detail: string | null;
}

function isoFromMs(value: number | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

/** Everything the operator needs on one page. Owner-only, never cached. */
adminRoutes.get("/admin/overview", async (c) => {
  requireAdmin(c);
  noStore(c);

  const now = Date.now();
  const since24h = new Date(now - DAY_MS).toISOString();

  const [totals, recent, users, topSeries, runs] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
         (SELECT COUNT(*) FROM user) AS users,
         (SELECT COUNT(*) FROM user WHERE created_at >= ?) AS new_users,
         (SELECT COUNT(*) FROM waitlist) AS waitlist,
         (SELECT COUNT(*) FROM subscriptions WHERE active = 1) AS active_subscriptions,
         (SELECT COUNT(*) FROM subscriptions) AS subscriptions,
         (SELECT COUNT(*) FROM series WHERE active = 1) AS active_series,
         (SELECT COUNT(*) FROM series) AS series,
         (SELECT COUNT(*) FROM series WHERE active = 1 AND last_error IS NOT NULL) AS series_errors,
         (SELECT COUNT(*) FROM chapters) AS chapters,
         (SELECT COUNT(*) FROM destinations WHERE status = 'active') AS active_destinations,
         (SELECT COUNT(*) FROM destinations WHERE status = 'disabled') AS disabled_destinations,
         (SELECT COUNT(*) FROM destinations) AS destinations,
         (SELECT COUNT(*) FROM deliveries WHERE status = 'pending') AS pending,
         (SELECT COUNT(*) FROM deliveries WHERE status = 'retry') AS retry,
         (SELECT COUNT(*) FROM deliveries WHERE status = 'sent') AS sent_total,
         (SELECT COUNT(*) FROM deliveries WHERE status = 'failed') AS failed_total,
         (SELECT MAX(started_at) FROM job_runs) AS last_run_at`,
    )
      .bind(now - 7 * DAY_MS)
      .first<TotalsRow>(),
    c.env.DB.prepare(
      "SELECT status, COUNT(*) AS count FROM deliveries WHERE created_at >= ? GROUP BY status",
    )
      .bind(since24h)
      .all<{ status: string; count: number }>(),
    c.env.DB.prepare(
      `SELECT u.id, u.name, u.created_at,
              a.account_id AS discord_id,
              (SELECT COUNT(*) FROM subscriptions s WHERE s.user_id = u.id AND s.active = 1) AS series_active,
              (SELECT COUNT(*) FROM subscriptions s WHERE s.user_id = u.id) AS series_total,
              (SELECT COUNT(*) FROM destinations d WHERE d.user_id = u.id) AS destinations,
              (SELECT MAX(s2.updated_at) FROM session s2 WHERE s2.user_id = u.id) AS last_seen_at,
              EXISTS(SELECT 1 FROM waitlist w WHERE w.discord_id = COALESCE(a.account_id, u.id)) AS waitlisted
       FROM user u
       LEFT JOIN account a ON a.user_id = u.id AND a.provider_id = 'discord'
       ORDER BY u.created_at DESC
       LIMIT ?`,
    )
      .bind(USER_LIST_LIMIT)
      .all<UserRow>(),
    c.env.DB.prepare(
      `SELECT se.id, se.title, COUNT(*) AS subscribers
       FROM subscriptions s JOIN series se ON se.id = s.series_id
       WHERE s.active = 1
       GROUP BY se.id
       ORDER BY subscribers DESC, se.title COLLATE NOCASE
       LIMIT 6`,
    ).all<TopSeriesRow>(),
    c.env.DB.prepare(
      `SELECT id, started_at, finished_at, status, feeds_checked, chapters_found,
              deliveries_sent, errors, detail
       FROM job_runs ORDER BY started_at DESC LIMIT 8`,
    ).all<RunRow>(),
  ]);

  const perStatus = new Map((recent.results ?? []).map((row) => [row.status, row.count]));
  const countOf = (status: string): number => perStatus.get(status) ?? 0;
  const lastRunAt = totals?.last_run_at ?? null;
  const lastRunTime = lastRunAt === null ? null : new Date(lastRunAt).getTime();

  return c.json({
    stats: {
      users: totals?.users ?? 0,
      newUsers7d: totals?.new_users ?? 0,
      waitlist: totals?.waitlist ?? 0,
      subscriptions: { active: totals?.active_subscriptions ?? 0, total: totals?.subscriptions ?? 0 },
      series: {
        active: totals?.active_series ?? 0,
        total: totals?.series ?? 0,
        withErrors: totals?.series_errors ?? 0,
      },
      destinations: {
        active: totals?.active_destinations ?? 0,
        disabled: totals?.disabled_destinations ?? 0,
        total: totals?.destinations ?? 0,
      },
      chapters: totals?.chapters ?? 0,
      deliveries: {
        sent24h: countOf("sent"),
        retry24h: countOf("retry"),
        failed24h: countOf("failed"),
        pending24h: countOf("pending"),
        skipped24h: countOf("skipped"),
        sentTotal: totals?.sent_total ?? 0,
        failedTotal: totals?.failed_total ?? 0,
        pending: totals?.pending ?? 0,
        retry: totals?.retry ?? 0,
      },
      cron: {
        lastRunAt,
        healthy: lastRunTime !== null && now - lastRunTime < CRON_STALE_MS,
      },
    },
    users: (users.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      discordId: row.discord_id,
      createdAt: isoFromMs(row.created_at),
      lastSeenAt: isoFromMs(row.last_seen_at),
      seriesActive: row.series_active,
      seriesTotal: row.series_total,
      destinations: row.destinations,
      waitlisted: row.waitlisted === 1,
    })),
    topSeries: (topSeries.results ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      subscribers: row.subscribers,
    })),
    runs: (runs.results ?? []).map((row) => ({
      id: row.id,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      status: row.status,
      feedsChecked: row.feeds_checked,
      chaptersFound: row.chapters_found,
      deliveriesSent: row.deliveries_sent,
      errors: row.errors,
      detail: row.detail,
    })),
  });
});
