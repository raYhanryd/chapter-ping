import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/worker";
import { createTestDb, type TestDb } from "./helpers";

const ORIGIN = "http://localhost:8787";
const SERIES_ID = "public-series-1";
const EXTERNAL_ID = "01J76XY7E9FNDZ1DBBM6PBJPFK";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.db.prepare("DELETE FROM rate_limits").run();
  await testDb.db.prepare("DELETE FROM subscriptions").run();
  await testDb.db.prepare("DELETE FROM series").run();

  const now = new Date().toISOString();
  await testDb.db
    .prepare(
      "INSERT INTO series (id, source, external_id, title, feed_url, site_url, latest_chapter_label, latest_chapter_title, latest_chapter_url, latest_published_at, next_check_at, active, created_at, updated_at) VALUES (?, 'weebcentral', ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(
      SERIES_ID,
      EXTERNAL_ID,
      "One Piece",
      `https://weebcentral.com/series/${EXTERNAL_ID}/rss`,
      `https://weebcentral.com/series/${EXTERNAL_ID}`,
      "Chapter 1132",
      "The Sun God",
      "https://weebcentral.com/chapters/abc",
      "2026-11-20T10:00:00.000Z",
      now,
      now,
      now,
    )
    .run();
});

function app() {
  return createApp({ resolveUser: async () => null });
}

describe("public series", () => {
  it("serves a series to a signed-out visitor", async () => {
    const res = await app().request(`${ORIGIN}/api/public/series/${SERIES_ID}`, {}, testDb.env);
    const body = (await res.json()) as {
      series: {
        id: string;
        title: string;
        coverUrl: string;
        siteUrl: string;
        latestChapter: { label: string; title: string; url: string } | null;
      };
    };

    expect(res.status).toBe(200);
    expect(body.series.id).toBe(SERIES_ID);
    expect(body.series.title).toBe("One Piece");
    expect(body.series.coverUrl).toBe(`http://localhost:8787/cover/${EXTERNAL_ID}.jpg`);
    expect(body.series.siteUrl).toBe(`https://weebcentral.com/series/${EXTERNAL_ID}`);
    expect(body.series.latestChapter).toEqual({
      label: "Chapter 1132",
      title: "The Sun God",
      url: "https://weebcentral.com/chapters/abc",
      publishedAt: "2026-11-20T10:00:00.000Z",
    });
  });

  it("404s an unknown series", async () => {
    const res = await app().request(`${ORIGIN}/api/public/series/nope`, {}, testDb.env);

    expect(res.status).toBe(404);
  });

  it("limits each real client address separately behind the proxy", async () => {
    const application = app();
    const as = (ip: string) => ({
      headers: { "x-forwarded-host": "chapterping.vercel.app", "x-forwarded-for": `${ip}, 76.76.21.21` },
    });

    for (let i = 0; i < 60; i += 1) {
      const res = await application.request(
        `${ORIGIN}/api/public/series/${SERIES_ID}`,
        as("203.0.113.7"),
        testDb.env,
      );
      expect(res.status).toBe(200);
    }

    const limited = await application.request(
      `${ORIGIN}/api/public/series/${SERIES_ID}`,
      as("203.0.113.7"),
      testDb.env,
    );
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();

    // The whole point: another visitor is not in the same bucket.
    const neighbour = await application.request(
      `${ORIGIN}/api/public/series/${SERIES_ID}`,
      as("203.0.113.8"),
      testDb.env,
    );
    expect(neighbour.status).toBe(200);
  });
});
