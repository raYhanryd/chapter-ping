import { ACTIVITY_RETENTION_DAYS, WAITLIST_RETENTION_DAYS } from "../../shared/constants";

function cutoff(now: Date, days: number): string {
  return new Date(now.getTime() - days * 24 * 60 * 60_000).toISOString();
}

export async function cleanup(db: D1Database, now: Date): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM job_runs WHERE started_at < ?").bind(cutoff(now, ACTIVITY_RETENTION_DAYS)),
    db.prepare("DELETE FROM deliveries WHERE status IN ('sent', 'failed', 'skipped') AND updated_at < ?").bind(
      cutoff(now, ACTIVITY_RETENTION_DAYS),
    ),
    db.prepare("DELETE FROM waitlist WHERE created_at < ?").bind(cutoff(now, WAITLIST_RETENTION_DAYS)),
    db.prepare("DELETE FROM rate_limits WHERE window_start < ?").bind(cutoff(now, 1)),
  ]);
}
