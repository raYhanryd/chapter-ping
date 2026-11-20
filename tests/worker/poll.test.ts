import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pollDueSeries } from "../../src/worker/jobs/poll";
import type { Env } from "../../src/worker/env";
import { count, createTestDb, type TestDb } from "./helpers";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const FEED_URL = "https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/rss";

const feed = (chapter: number) => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>One Piece</title>
  <link>https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece</link>
  <item>
    <title>One Piece Chapter ${chapter}</title>
    <link>https://weebcentral.com/chapters/chapter-${chapter}</link>
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
  for (const table of ["deliveries", "chapters", "subscriptions", "series", "destinations", "rate_limits", "job_locks", "job_runs"]) {
    await testDb.db.prepare(`DELETE FROM ${table}`).run();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function seedUser(): Promise<string> {
  seq += 1;
  const id = `poll-user-${seq}`;
  await testDb.db
    .prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(id, `Reader ${seq}`, `${id}@discord.invalid`, Date.now(), Date.now())
    .run();
  return id;
}

async function seedDestination(userId: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await testDb.db
    .prepare(
      "INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, created_at, updated_at) VALUES (?, ?, 'Channel', 'cipher', 'iv', ?, ?, ?)",
    )
    .bind(id, userId, crypto.randomUUID(), now, now)
    .run();
  return id;
}

async function seedSeries(options: { nextCheckAt?: string; latest?: number | null; active?: number; etag?: string | null } = {}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await testDb.db
    .prepare(
      `INSERT INTO series (id, external_id, title, feed_url, site_url, latest_chapter_number, latest_chapter_label,
        latest_chapter_title, latest_chapter_url, next_check_at, last_checked_at, etag, active, created_at, updated_at)
       VALUES (?, ?, 'One Piece', ?, 'https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece', ?, 'Chapter 12',
        'One Piece Chapter 12', 'https://weebcentral.com/chapters/chapter-12', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      crypto.randomUUID(),
      FEED_URL,
      options.latest === undefined ? 12 : options.latest,
      options.nextCheckAt ?? NOW.toISOString(),
      new Date(NOW.getTime() - 30 * 60_000).toISOString(),
      options.etag ?? "etag-1",
      options.active ?? 1,
      now,
      now,
    )
    .run();
  return id;
}

async function subscribe(seriesId: string, destinationId: string, userId: string, active = 1): Promise<string> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await testDb.db
    .prepare(
      "INSERT INTO subscriptions (id, user_id, series_id, destination_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, userId, seriesId, destinationId, active, now, now)
    .run();
  return id;
}

function env(overrides: Partial<Env> = {}): Env {
  return { ...testDb.env, ...overrides };
}

function mockFeed(response: () => Response = () => new Response(feed(13))) {
  const spy = vi.fn(async () => response());
  return spy;
}

describe("pollDueSeries", () => {
  it("inserts a new chapter and one delivery per active destination", async () => {
    const first = await seedUser();
    const second = await seedUser();
    const seriesId = await seedSeries();
    const firstDestination = await seedDestination(first);
    const secondDestination = await seedDestination(second);
    await subscribe(seriesId, firstDestination, first);
    await subscribe(seriesId, secondDestination, second);

    const result = await pollDueSeries(env(), NOW, mockFeed());

    expect(result).toEqual({ checked: 1, chaptersFound: 1, errors: 0 });
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM chapters WHERE series_id = ?", seriesId)).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries")).toBe(2);
    expect(
      await count(
        testDb.db,
        "SELECT COUNT(*) AS count FROM series WHERE id = ? AND latest_chapter_number = 13 AND latest_chapter_label = 'Chapter 13'",
        seriesId,
      ),
    ).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series WHERE latest_chapter_url = 'https://weebcentral.com/chapters/chapter-13'")).toBe(1);

    const next = await testDb.db
      .prepare("SELECT next_check_at, last_checked_at FROM series WHERE id = ?")
      .bind(seriesId)
      .first<{ next_check_at: string; last_checked_at: string }>();
    expect(next?.next_check_at > NOW.toISOString()).toBe(true);
    expect(next?.last_checked_at).toBe(NOW.toISOString());
  });

  it("does not duplicate a chapter or a delivery when the same feed is polled again", async () => {
    const user = await seedUser();
    const seriesId = await seedSeries();
    await subscribe(seriesId, await seedDestination(user), user);

    await pollDueSeries(env(), NOW, mockFeed());
    await testDb.db.prepare("UPDATE series SET next_check_at = ? WHERE id = ?").bind(NOW.toISOString(), seriesId).run();
    const second = await pollDueSeries(env(), new Date(NOW.getTime() + 60_000), mockFeed());

    expect(second).toEqual({ checked: 1, chaptersFound: 0, errors: 0 });
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM chapters")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries")).toBe(1);
  });

  it("handles 304 by touching only last_checked_at", async () => {
    const user = await seedUser();
    const seriesId = await seedSeries();
    await subscribe(seriesId, await seedDestination(user), user);

    const result = await pollDueSeries(env(), NOW, mockFeed(() => new Response(null, { status: 304 })));

    expect(result).toEqual({ checked: 1, chaptersFound: 0, errors: 0 });
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM chapters")).toBe(0);
    const row = await testDb.db
      .prepare("SELECT last_checked_at, latest_chapter_number, etag, last_error FROM series WHERE id = ?")
      .bind(seriesId)
      .first<{ last_checked_at: string; latest_chapter_number: number; etag: string; last_error: string | null }>();
    expect(row?.last_checked_at).toBe(NOW.toISOString());
    expect(row?.latest_chapter_number).toBe(12);
    expect(row?.etag).toBe("etag-1");
    expect(row?.last_error).toBeNull();
  });

  it("schedules a sooner retry and keeps latest state on a feed error", async () => {
    const user = await seedUser();
    const seriesId = await seedSeries();
    await subscribe(seriesId, await seedDestination(user), user);

    const result = await pollDueSeries(env(), NOW, mockFeed(() => new Response("nope", { status: 500 })));

    expect(result).toEqual({ checked: 1, chaptersFound: 0, errors: 1 });
    const row = await testDb.db
      .prepare("SELECT last_error, latest_chapter_number, next_check_at FROM series WHERE id = ?")
      .bind(seriesId)
      .first<{ last_error: string | null; latest_chapter_number: number; next_check_at: string }>();
    expect(row?.last_error).toBeTruthy();
    expect(row?.latest_chapter_number).toBe(12);
    expect(new Date(row!.next_check_at).getTime() - NOW.getTime()).toBeLessThan(30 * 60_000);
  });

  it("only fans out to active subscriptions", async () => {
    const activeUser = await seedUser();
    const pausedUser = await seedUser();
    const seriesId = await seedSeries();
    const activeDestination = await seedDestination(activeUser);
    const pausedDestination = await seedDestination(pausedUser);
    await subscribe(seriesId, activeDestination, activeUser, 1);
    await subscribe(seriesId, pausedDestination, pausedUser, 0);

    await pollDueSeries(env(), NOW, mockFeed());

    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries")).toBe(1);
    expect(
      await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries WHERE destination_id = ?", activeDestination),
    ).toBe(1);
  });

  it("gives no delivery to a subscription created after discovery", async () => {
    const first = await seedUser();
    const second = await seedUser();
    const seriesId = await seedSeries();
    await subscribe(seriesId, await seedDestination(first), first);
    await pollDueSeries(env(), NOW, mockFeed());

    await subscribe(seriesId, await seedDestination(second), second);
    await testDb.db.prepare("UPDATE series SET next_check_at = ? WHERE id = ?").bind(NOW.toISOString(), seriesId).run();
    await pollDueSeries(env(), new Date(NOW.getTime() + 60_000), mockFeed());

    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries")).toBe(1);
  });

  it("respects CRON_BATCH_SERIES", async () => {
    const user = await seedUser();
    const destination = await seedDestination(user);
    await subscribe(await seedSeries({ latest: null }), destination, user);
    await subscribe(await seedSeries({ latest: null }), destination, user);

    const result = await pollDueSeries(env({ CRON_BATCH_SERIES: "1" }), NOW, mockFeed());

    expect(result.checked).toBe(1);
  });

  it("does not poll a series without an active subscriber", async () => {
    const user = await seedUser();
    const seriesId = await seedSeries();
    await subscribe(seriesId, await seedDestination(user), user, 0);
    const fetchSpy = mockFeed();

    const result = await pollDueSeries(env(), NOW, fetchSpy);

    expect(result).toEqual({ checked: 0, chaptersFound: 0, errors: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
