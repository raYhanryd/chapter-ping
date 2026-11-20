export interface RunCounts {
  status: string;
  feedsChecked: number;
  chaptersFound: number;
  deliveriesSent: number;
  errors: number;
  detail: string | null;
  finishedAt: Date;
}

export async function startRun(db: D1Database, now: Date): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      "INSERT INTO job_runs (id, started_at, status) VALUES (?, ?, 'running')",
    )
    .bind(id, now.toISOString())
    .run();
  return id;
}

export async function finishRun(db: D1Database, id: string, counts: RunCounts): Promise<void> {
  await db
    .prepare(
      `UPDATE job_runs SET status = ?, finished_at = ?, feeds_checked = ?, chapters_found = ?,
         deliveries_sent = ?, errors = ?, detail = ? WHERE id = ?`,
    )
    .bind(
      counts.status,
      counts.finishedAt.toISOString(),
      counts.feedsChecked,
      counts.chaptersFound,
      counts.deliveriesSent,
      counts.errors,
      counts.detail,
      id,
    )
    .run();
}
