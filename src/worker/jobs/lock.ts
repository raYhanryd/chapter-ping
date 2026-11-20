const EPOCH = "1970-01-01T00:00:00.000Z";

export async function acquireLock(
  db: D1Database,
  name: string,
  leaseMinutes: number,
  now: Date,
): Promise<boolean> {
  const nowIso = now.toISOString();
  const until = new Date(now.getTime() + leaseMinutes * 60_000).toISOString();

  await db
    .prepare("INSERT OR IGNORE INTO job_locks (name, locked_until) VALUES (?, ?)")
    .bind(name, EPOCH)
    .run();

  const result = await db
    .prepare("UPDATE job_locks SET locked_until = ? WHERE name = ? AND locked_until < ?")
    .bind(until, name, nowIso)
    .run();
  return result.meta.changes === 1;
}

export async function releaseLock(db: D1Database, name: string): Promise<void> {
  await db.prepare("UPDATE job_locks SET locked_until = ? WHERE name = ?").bind(EPOCH, name).run();
}
