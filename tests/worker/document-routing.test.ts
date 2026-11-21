import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/worker";
import type { Env } from "../../src/worker/env";
import { renderAssetHeaders, SECURITY_HEADERS } from "../../src/shared/security-headers";
import { createTestDb, type TestDb } from "./helpers";

const PROXY = "https://chapterping.vercel.app";
const WORKER = "https://chapter-tracker-web.chapterping.workers.dev";
const DOCUMENT = [
  "<!doctype html><html><head>",
  "<!-- social-meta:start -->",
  "<title>Chapter Ping</title>",
  "<!-- social-meta:end -->",
  '</head><body><div id="root"></div></body></html>',
].join("");

const SERIES_ID = "series-1";
const SUBSCRIPTION_ID = "sub-1";

/** A tracked series, with the destination its subscription needs to exist. */
let seeded: Promise<void> | null = null;

function seedSeries(): Promise<void> {
  seeded ??= insertSeries();
  return seeded;
}

async function insertSeries(): Promise<void> {
  const now = new Date().toISOString();
  const externalId = "01J76XY7E9FNDZ1DBBM6PBJPFK";

  await testDb.db
    .prepare(
      "INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind("dest-1", "user-1", "Anime", "ciphertext", "iv", "fingerprint", now, now)
    .run();
  await testDb.db
    .prepare(
      "INSERT INTO series (id, source, external_id, title, feed_url, site_url, latest_chapter_label, latest_chapter_title, next_check_at, active, created_at, updated_at) VALUES (?, 'weebcentral', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
    )
    .bind(
      SERIES_ID,
      externalId,
      "One Piece",
      `https://weebcentral.com/series/${externalId}/rss`,
      `https://weebcentral.com/series/${externalId}`,
      "Chapter 1132",
      "The Sun God",
      now,
      now,
      now,
    )
    .run();
  await testDb.db
    .prepare(
      "INSERT INTO subscriptions (id, user_id, series_id, destination_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(SUBSCRIPTION_ID, "user-1", SERIES_ID, "dest-1", now, now)
    .run();
}

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

function env(): Env {
  return {
    ...testDb.env,
    PUBLIC_URL: PROXY,
    ASSETS: {
      fetch: async () =>
        new Response(DOCUMENT, { status: 200, headers: { "content-type": "text/html" } }),
    } as unknown as Env["ASSETS"],
  };
}

function app() {
  return createApp({ resolveUser: async () => null });
}

describe("document routing", () => {
  it("redirects a direct workers.dev page hit to the public origin", async () => {
    const res = await app().request(`${WORKER}/dashboard?tab=1`, {}, env());

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${PROXY}/dashboard?tab=1`);
  });

  it("serves the document the proxy forwarded, with the cover host allowed", async () => {
    const res = await app().request(
      `${WORKER}/dashboard`,
      { headers: { "x-forwarded-host": "chapterping.vercel.app" } },
      env(),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(DOCUMENT);
    expect(res.headers.get("content-security-policy")).toContain("https://temp.compsci88.com");
  });

  it("keeps API routes answering on the direct origin", async () => {
    const res = await app().request(`${WORKER}/api/health`, {}, env());

    expect(res.status).toBe(200);
  });

  it("unfurls a shared series page with its cover and latest chapter", async () => {
    await seedSeries();

    const res = await app().request(
      `${WORKER}/series/${SUBSCRIPTION_ID}`,
      { headers: { "x-forwarded-host": "chapterping.vercel.app" } },
      env(),
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("<title>One Piece — Chapter Ping</title>");
    expect(html).toContain(`content="${PROXY}/cover/01J76XY7E9FNDZ1DBBM6PBJPFK.jpg"`);
    expect(html).toContain("Chapter 1132 — The Sun God is out.");
    expect(html).toContain(`content="${PROXY}/series/${SUBSCRIPTION_ID}"`);
    expect(html).not.toContain("social-card.png");
  });

  it("unfurls the public series link by series id", async () => {
    await seedSeries();

    const res = await app().request(
      `${WORKER}/s/${SERIES_ID}`,
      { headers: { "x-forwarded-host": "chapterping.vercel.app" } },
      env(),
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("<title>One Piece — Chapter Ping</title>");
    expect(html).toContain(`content="${PROXY}/cover/01J76XY7E9FNDZ1DBBM6PBJPFK.jpg"`);
    expect(html).toContain(`content="${PROXY}/s/${SERIES_ID}"`);
  });

  it("keeps the generic card when the series cannot be resolved", async () => {
    const res = await app().request(
      `${WORKER}/series/not-a-series`,
      { headers: { "x-forwarded-host": "chapterping.vercel.app" } },
      env(),
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("<title>Chapter Ping</title>");
    expect(html).not.toContain("temp.compsci88.com");
  });

  it("keeps the generic card for an unknown public series link", async () => {
    const res = await app().request(
      `${WORKER}/s/not-a-series`,
      { headers: { "x-forwarded-host": "chapterping.vercel.app" } },
      env(),
    );
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("<title>Chapter Ping</title>");
  });

  it("renders the static asset headers from the Worker's own definitions", () => {
    const rendered = renderAssetHeaders();

    expect(rendered.startsWith("/*\n")).toBe(true);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(rendered).toContain(`  ${name}: ${value}\n`);
    }
    expect(rendered).toContain("Strict-Transport-Security: max-age=31536000");
  });
});
