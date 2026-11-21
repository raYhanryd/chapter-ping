import type { Env } from "../env";
import { sanitizeMessage } from "../lib/errors";
import { cleanup } from "./cleanup";
import { deliverDue } from "./deliver";
import { acquireLock, releaseLock } from "./lock";
import { pollDueSeries } from "./poll";
import { finishRun, startRun } from "./runs";
import { alertOperator } from "../lib/operator-alert";

const LOCK_NAME = "cron";
const LEASE_MINUTES = 4;
// Nine missed five-minute cycles. Long enough that a deploy does not page anyone.
const STALE_RUN_MINUTES = 45;

async function lastSuccessAgeMinutes(db: D1Database, now: Date): Promise<number | null> {
  const row = await db
    .prepare("SELECT finished_at FROM job_runs WHERE status = 'ok' ORDER BY finished_at DESC LIMIT 1")
    .first<{ finished_at: string }>();
  if (!row?.finished_at) return null;
  const finished = new Date(row.finished_at).getTime();
  if (!Number.isFinite(finished)) return null;
  return (now.getTime() - finished) / 60_000;
}

export interface JobRunSummary {
  locked: boolean;
  runId: string | null;
  checked: number;
  chaptersFound: number;
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
  errors: number;
}

const EMPTY: JobRunSummary = {
  locked: false,
  runId: null,
  checked: 0,
  chaptersFound: 0,
  sent: 0,
  retried: 0,
  failed: 0,
  skipped: 0,
  errors: 0,
};

export async function runScheduled(
  env: Env,
  fetchImpl: typeof fetch,
  now: Date = new Date(),
): Promise<JobRunSummary> {
  const lease = await acquireLock(env.DB, LOCK_NAME, LEASE_MINUTES, now);
  if (!lease) return { ...EMPTY };

  let runId: string | null = null;
  let checked = 0;
  let chaptersFound = 0;
  let sent = 0;
  let retried = 0;
  let failed = 0;
  let skipped = 0;
  let errors = 0;

  try {
    const staleFor = await lastSuccessAgeMinutes(env.DB, now);
    if (staleFor !== null && staleFor > STALE_RUN_MINUTES) {
      await alertOperator(env, `no successful run for ${Math.round(staleFor)} minutes`, { now });
    }

    runId = await startRun(env.DB, now);

    const poll = await pollDueSeries(env, now, fetchImpl);
    checked = poll.checked;
    chaptersFound = poll.chaptersFound;
    errors = poll.errors;

    const delivery = await deliverDue(env, now, fetchImpl);
    sent = delivery.sent;
    retried = delivery.retried;
    failed = delivery.failed;
    skipped = delivery.skipped;

    await cleanup(env.DB, now);

    const summary: JobRunSummary = {
      locked: true,
      runId,
      checked,
      chaptersFound,
      sent,
      retried,
      failed,
      skipped,
      errors,
    };

    await finishRun(env.DB, runId, {
      status: "ok",
      feedsChecked: checked,
      chaptersFound,
      deliveriesSent: sent,
      errors,
      detail: null,
      finishedAt: now,
    });

    return summary;
  } catch (error) {
    await alertOperator(
      env,
      `scheduled run failed: ${
        error instanceof Error ? sanitizeMessage(error.message) : "unknown error"
      }`,
      { now },
    );

    if (runId) {
      try {
        await finishRun(env.DB, runId, {
          status: "error",
          feedsChecked: checked,
          chaptersFound,
          deliveriesSent: sent,
          errors: errors + 1,
          detail: error instanceof Error ? sanitizeMessage(error.message).slice(0, 300) : null,
          finishedAt: now,
        });
      } catch {
        // The original failure matters more than the ledger write.
      }
    }
    throw error;
  } finally {
    await releaseLock(env.DB, LOCK_NAME, lease);
  }
}
