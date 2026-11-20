import type { D1Database } from "@cloudflare/workers-types";

async function scalar(db: D1Database, sql: string, ...values: unknown[]): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...values)
    .first<{ count: number }>();
  return row?.count ?? 0;
}

// Spec 3.6: an active account is a user with at least one active subscription.
export function accountCount(db: D1Database): Promise<number> {
  return scalar(db, "SELECT COUNT(DISTINCT user_id) AS count FROM subscriptions WHERE active = 1");
}

export function userSeriesCount(db: D1Database, userId: string): Promise<number> {
  return scalar(db, "SELECT COUNT(*) AS count FROM subscriptions WHERE user_id = ?", userId);
}

export function userDestinationCount(db: D1Database, userId: string): Promise<number> {
  return scalar(db, "SELECT COUNT(*) AS count FROM destinations WHERE user_id = ?", userId);
}

export function globalActiveSeriesCount(db: D1Database): Promise<number> {
  return scalar(db, "SELECT COUNT(*) AS count FROM series WHERE active = 1");
}
