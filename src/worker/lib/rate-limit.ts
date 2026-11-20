import type { D1Database } from "@cloudflare/workers-types";

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
}

/**
 * Fixed-window counter. One atomic upsert per call, so two Workers cannot both
 * read a stale count and each let a request through.
 */
export async function checkRateLimit(
  db: D1Database,
  key: string,
  limit: number,
  windowSeconds: number,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const windowStart = new Date(now.getTime() - windowSeconds * 1000).toISOString();
  const nowIso = now.toISOString();

  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start <= ? THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ? THEN ? ELSE window_start END
       RETURNING count, window_start`,
    )
    .bind(key, nowIso, windowStart, windowStart, nowIso)
    .first<{ count: number; window_start: string }>();

  const count = row?.count ?? limit + 1;
  const start = row?.window_start ?? nowIso;
  const resetAt = new Date(new Date(start).getTime() + windowSeconds * 1000).getTime();
  const retryAfter = Math.max(1, Math.ceil((resetAt - now.getTime()) / 1000));

  return { allowed: count <= limit, retryAfter };
}
