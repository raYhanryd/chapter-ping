import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runScheduled } from "../../src/worker/jobs";
import { encryptSecret } from "../../src/worker/lib/crypto";
import { count, createTestDb, type TestDb } from "./helpers";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
const USERS = 100;
const SERIES = 150;
const DUE = 20;

function feed(chapter: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Load test series</title>
  <item>
    <title>Load test series Chapter ${chapter}</title>
    <link>https://weebcentral.com/chapters/load-${chapter}</link>
    <pubDate>Fri, 20 Nov 2026 02:56:04 +0000</pubDate>
  </item>
</channel></rss>`;
}

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

describe("capacity load test", () => {
  it("runs one full 20-feed / 20-delivery batch at the documented caps", async () => {
    const nowIso = NOW.toISOString();
    const future = new Date(NOW.getTime() + 30 * 60_000).toISOString();
    const statements = [];

    for (let i = 0; i < USERS; i += 1) {
      statements.push(
        testDb.db
          .prepare(
            "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)",
          )
          .bind(`load-user-${i}`, `Reader ${i}`, `load-${i}@discord.invalid`, Date.now(), Date.now()),
      );
    }

    for (let i = 0; i < USERS; i += 1) {
      const encrypted = await encryptSecret(
        `https://discord.com/api/webhooks/123456789012345${String(i).padStart(3, "0")}/load_token_${i}`,
        KEY,
      );
      statements.push(
        testDb.db
          .prepare(
            "INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)",
          )
          .bind(
            `load-destination-${i}`,
            `load-user-${i}`,
            `Channel ${i}`,
            encrypted.ciphertext,
            encrypted.iv,
            `load-fingerprint-${i}`,
            nowIso,
            nowIso,
          ),
      );
    }

    for (let i = 0; i < SERIES; i += 1) {
      statements.push(
        testDb.db
          .prepare(
            "INSERT INTO series (id, external_id, title, feed_url, site_url, latest_chapter_number, latest_chapter_label, latest_chapter_title, latest_chapter_url, next_check_at, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 12, 'Chapter 12', 'Load test series Chapter 12', 'https://weebcentral.com/chapters/load-12', ?, 1, ?, ?)",
          )
          .bind(
            `load-series-${i}`,
            `load-external-${i}`,
            `Load test series ${i}`,
            `https://weebcentral.com/series/loadseries${String(i).padStart(10, "0")}/rss`,
            `https://weebcentral.com/series/loadseries${String(i).padStart(10, "0")}`,
            i < DUE ? nowIso : future,
            nowIso,
            nowIso,
          ),
      );
    }

    for (let i = 0; i < SERIES; i += 1) {
      statements.push(
        testDb.db
          .prepare(
            "INSERT INTO subscriptions (id, user_id, series_id, destination_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
          )
          .bind(
            `load-subscription-${i}`,
            `load-user-${i % USERS}`,
            `load-series-${i}`,
            `load-destination-${i % USERS}`,
            nowIso,
            nowIso,
          ),
      );
    }

    await testDb.db.batch(statements);

    const fetchMock = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/rss")) {
        return new Response(feed(13), { status: 200, headers: { "content-type": "application/rss+xml" } });
      }
      if (url.includes("/api/webhooks/")) return new Response(null, { status: 204 });
      throw new Error(`Unexpected load-test fetch: ${url}`);
    }) as typeof fetch;

    const started = performance.now();
    const summary = await runScheduled(
      { ...testDb.env, WEBHOOK_ENCRYPTION_KEY: KEY },
      fetchMock,
      NOW,
    );
    const elapsedMs = Math.round(performance.now() - started);

    console.log(
      `load-test: users=${USERS} series=${SERIES} checked=${summary.checked} chapters=${summary.chaptersFound} sent=${summary.sent} errors=${summary.errors} elapsed=${elapsedMs}ms`,
    );

    expect(summary.locked).toBe(true);
    expect(summary.checked).toBe(DUE);
    expect(summary.chaptersFound).toBe(DUE);
    expect(summary.sent).toBe(DUE);
    expect(summary.failed).toBe(0);
    expect(summary.errors).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM chapters")).toBe(DUE);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries WHERE status = 'sent'")).toBe(DUE);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM job_runs")).toBe(1);
  });
});
