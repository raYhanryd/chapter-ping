const EPOCH = "1970-01-01T00:00:00.000Z";

/** Returns the lease token when acquired, or null when another run holds the lock. */
export async function acquireLock(
  db: D1Database,
  name: string,
  leaseMinutes: number,
  now: Date,
): Promise<string | null> {
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
  return result.meta.changes === 1 ? until : null;
}

/** Releases only the caller's lease; a newer run's lock is left alone. */
export async function releaseLock(db: D1Database, name: string, lease: string): Promise<void> {
  await db
    .prepare("UPDATE job_locks SET locked_until = ? WHERE name = ? AND locked_until = ?")
    .bind(EPOCH, name, lease)
    .run();
}
