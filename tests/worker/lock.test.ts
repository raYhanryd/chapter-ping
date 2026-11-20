import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { acquireLock, releaseLock } from "../../src/worker/jobs/lock";
import { finishRun, startRun } from "../../src/worker/jobs/runs";
import { createTestDb, count, type TestDb } from "./helpers";

let testDb: TestDb;
const NOW = new Date("2026-11-20T12:00:00.000Z");
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  for (const table of ["job_locks", "job_runs"]) {
    await testDb.db.prepare(`DELETE FROM ${table}`).run();
  }
});

describe("job lock", () => {
  it("claims a free lock once", async () => {
    expect(await acquireLock(testDb.db, "cron", 4, NOW)).toBe(true);
    expect(await acquireLock(testDb.db, "cron", 4, NOW)).toBe(false);
  });

  it("never grants two concurrent claims", async () => {
    const results = await Promise.all([
      acquireLock(testDb.db, "cron", 4, NOW),
      acquireLock(testDb.db, "cron", 4, NOW),
      acquireLock(testDb.db, "cron", 4, NOW),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("allows reacquire after the lease expires", async () => {
    expect(await acquireLock(testDb.db, "cron", 4, NOW)).toBe(true);
    expect(await acquireLock(testDb.db, "cron", 4, later(5))).toBe(true);
    expect(await acquireLock(testDb.db, "cron", 4, later(5))).toBe(false);
  });

  it("allows reacquire after an explicit release", async () => {
    expect(await acquireLock(testDb.db, "cron", 4, NOW)).toBe(true);
    await releaseLock(testDb.db, "cron");
    expect(await acquireLock(testDb.db, "cron", 4, NOW)).toBe(true);
  });
});

describe("job runs", () => {
  it("records a run from start to finish", async () => {
    const startedAt = NOW.toISOString();
    const id = await startRun(testDb.db, NOW);

    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM job_runs WHERE id = ? AND status = 'running'", id)).toBe(1);

    await finishRun(testDb.db, id, {
      status: "ok",
      feedsChecked: 3,
      chaptersFound: 1,
      deliveriesSent: 2,
      errors: 0,
      detail: null,
      finishedAt: new Date(NOW.getTime() + 1_000),
    });

    const row = await testDb.db
      .prepare("SELECT * FROM job_runs WHERE id = ?")
      .bind(id)
      .first<{ status: string; started_at: string; finished_at: string; feeds_checked: number; chapters_found: number; deliveries_sent: number }>();
    expect(row).toMatchObject({
      status: "ok",
      started_at: startedAt,
      feeds_checked: 3,
      chapters_found: 1,
      deliveries_sent: 2,
    });
    expect(row?.finished_at).toBe(new Date(NOW.getTime() + 1_000).toISOString());
  });
});
