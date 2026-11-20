import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup } from "../../src/worker/jobs/cleanup";
import { runScheduled } from "../../src/worker/jobs";
import { acquireLock } from "../../src/worker/jobs/lock";
import type { Env } from "../../src/worker/env";
import { encryptSecret } from "../../src/worker/lib/crypto";
import { count, createTestDb, type TestDb } from "./helpers";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const FEED_URL = "https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/rss";
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>One Piece</title>
  <item>
    <title>One Piece Chapter 13</title>
    <link>https://weebcentral.com/chapters/13</link>
    <pubDate>Fri, 20 Nov 2026 02:56:04 +0000</pubDate>
  </item>
</channel></rss>`;

let testDb: TestDb;
let seq = 0;

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  for (const table of ["deliveries", "chapters", "subscriptions", "series", "destinations", "waitlist", "rate_limits", "job_locks", "job_runs"]) {
    await testDb.db.prepare(`DELETE FROM ${table}`).run();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function env(overrides: Partial<Env> = {}): Env {
  return { ...testDb.env, WEBHOOK_ENCRYPTION_KEY: KEY, ...overrides };
}

async function seedDueWork(): Promise<{ seriesId: string; deliveryId: string; userId: string }> {
  seq += 1;
  const suffix = String(seq).padStart(2, "0");
  const userId = `sched-user-${suffix}`;
  const now = NOW.toISOString();
  await testDb.db
    .prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(userId, `Reader ${suffix}`, `${userId}@discord.invalid`, Date.now(), Date.now())
    .run();

  const encrypted = await encryptSecret(`https://discord.com/api/webhooks/123456789012345678/token_${suffix}`, KEY);
  const destinationId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, status, created_at, updated_at) VALUES (?, ?, 'Channel', ?, ?, ?, 'active', ?, ?)",
    )
    .bind(destinationId, userId, encrypted.ciphertext, encrypted.iv, crypto.randomUUID(), now, now)
    .run();

  const seriesId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO series (id, external_id, title, feed_url, site_url, latest_chapter_number, latest_chapter_label, latest_chapter_title, latest_chapter_url, next_check_at, active, created_at, updated_at) VALUES (?, ?, 'One Piece', ?, 'https://weebcentral.com/series/x', 12, 'Chapter 12', 'One Piece Chapter 12', 'https://weebcentral.com/chapters/12', ?, 1, ?, ?)",
    )
    .bind(seriesId, crypto.randomUUID(), FEED_URL, now, now, now)
    .run();

  await testDb.db
    .prepare(
      "INSERT INTO subscriptions (id, user_id, series_id, destination_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(crypto.randomUUID(), userId, seriesId, destinationId, now, now)
    .run();

  return { seriesId, deliveryId: "", userId };
}

async function seedActivityRows(): Promise<void> {
  seq += 1;
  const userId = `cleanup-user-${seq}`;
  const now = NOW.toISOString();
  const old = new Date(NOW.getTime() - 31 * 24 * 60 * 60_000).toISOString();
  const older = new Date(NOW.getTime() - 91 * 24 * 60 * 60_000).toISOString();
  await testDb.db
    .prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, 'Cleanup', ?, 0, ?, ?)")
    .bind(userId, `${userId}@discord.invalid`, Date.now(), Date.now())
    .run();
  const destinationId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, status, created_at, updated_at) VALUES (?, ?, 'Channel', 'c', 'i', ?, 'active', ?, ?)",
    )
    .bind(destinationId, userId, crypto.randomUUID(), now, now)
    .run();
  const seriesId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO series (id, external_id, title, feed_url, site_url, next_check_at, active, created_at, updated_at) VALUES (?, ?, 'One Piece', ?, 'u', ?, 1, ?, ?)",
    )
    .bind(seriesId, crypto.randomUUID(), FEED_URL, now, now, now)
    .run();

  for (const [index, status, updated] of [
    ["old-sent", "sent", old],
    ["old-failed", "failed", old],
    ["recent-sent", "sent", now],
    ["old-retry", "retry", old],
  ] as const) {
    const chapterId = crypto.randomUUID();
    await testDb.db
      .prepare(
        "INSERT INTO chapters (id, series_id, chapter_number, chapter_label, title, url, discovered_at) VALUES (?, ?, ?, ?, 't', 'u', ?)",
      )
      .bind(chapterId, seriesId, index.length + seq, index, now)
      .run();
    await testDb.db
      .prepare(
        "INSERT INTO deliveries (id, chapter_id, destination_id, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      )
      .bind(crypto.randomUUID(), chapterId, destinationId, status, updated, updated)
      .run();
  }

  for (const [status, started] of [
    ["ok", old],
    ["ok", now],
  ] as const) {
    await testDb.db
      .prepare("INSERT INTO job_runs (id, started_at, status) VALUES (?, ?, ?)")
      .bind(crypto.randomUUID(), started, status)
      .run();
  }
  for (const [discordId, created] of [
    ["old-wait", older],
    ["recent-wait", now],
  ] as const) {
    await testDb.db
      .prepare("INSERT INTO waitlist (id, discord_id, username, created_at) VALUES (?, ?, 'Reader', ?)")
      .bind(crypto.randomUUID(), discordId, created)
      .run();
  }
}

describe("runScheduled", () => {
  it("does no work and writes no run when the lock is held", async () => {
    await seedDueWork();
    await acquireLock(testDb.db, "cron", 4, NOW);
    const fetchSpy = vi.fn(async () => new Response(FEED));

    const summary = await runScheduled(env(), fetchSpy, NOW);

    expect(summary.locked).toBe(false);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM job_runs")).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("polls, delivers, records counts and releases the lock", async () => {
    const { seriesId } = await seedDueWork();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(FEED)));

    const summary = await runScheduled(env(), fetch, NOW);

    expect(summary).toMatchObject({ locked: true, checked: 1, chaptersFound: 1, sent: 1, failed: 0, errors: 0 });
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries WHERE status = 'sent'")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series WHERE id = ? AND latest_chapter_number = 13", seriesId)).toBe(1);

    const run = await testDb.db
      .prepare("SELECT status, feeds_checked, chapters_found, deliveries_sent FROM job_runs")
      .first<{ status: string; feeds_checked: number; chapters_found: number; deliveries_sent: number }>();
    expect(run).toMatchObject({ status: "ok", feeds_checked: 1, chapters_found: 1, deliveries_sent: 1 });
    expect(await acquireLock(testDb.db, "cron", 4, NOW)).toBe(true);
  });

  it("releases the lock after a thrown error", async () => {
    await testDb.db.exec(
      "CREATE TRIGGER fail_finish BEFORE UPDATE ON job_runs BEGIN SELECT RAISE(ABORT, 'finish failed'); END;",
    );
    await seedDueWork();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(FEED)));

    await expect(runScheduled(env(), fetch, NOW)).rejects.toThrow();
    await testDb.db.exec("DROP TRIGGER fail_finish");
    expect(await acquireLock(testDb.db, "cron", 4, NOW)).toBe(true);
  });
});

describe("cleanup", () => {
  it("removes only stale activity and keeps live series", async () => {
    await seedActivityRows();

    await cleanup(testDb.db, NOW);

    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM job_runs")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM waitlist")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries")).toBe(2);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries WHERE status = 'retry'")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series")).toBe(1);
  });
});
