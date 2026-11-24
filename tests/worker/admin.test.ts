import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/worker";
import type { Env } from "../../src/worker/env";
import { encryptSecret } from "../../src/worker/lib/crypto";
import type { SessionUser } from "../../src/worker/lib/session";
import { count, createTestDb, type TestDb } from "./helpers";

const ORIGIN = "http://localhost:8787";
const OWNER_DISCORD = "1245083537015570573";
const READER_DISCORD = "918360155983327243";
const KEY = Buffer.from(new Uint8Array(32).fill(9)).toString("base64");
const WEBHOOK_ID = "123456789012345678";
const webhookUrl = (token: string) => `https://discord.com/api/webhooks/${WEBHOOK_ID}/${token}`;

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Test Series</title>
  <link>https://weebcentral.com/series/ADMIN01AAAAA/Test-Series</link>
  <item>
    <title>Test Series Chapter 12</title>
    <link>https://weebcentral.com/chapters/abc</link>
    <pubDate>Fri, 20 Nov 2026 02:56:04 +0000</pubDate>
  </item>
</channel></rss>`;

const owner: SessionUser = { id: "owner", name: "raYhan_ryd", image: null, discordId: OWNER_DISCORD };
const reader: SessionUser = { id: "reader", name: "Reader", image: null, discordId: READER_DISCORD };

let testDb: TestDb;

function adminEnv(extra: Partial<Env> = {}): Env {
  return { ...testDb.env, ADMIN_DISCORD_IDS: OWNER_DISCORD, WEBHOOK_ENCRYPTION_KEY: KEY, ...extra };
}

function appFor(user: SessionUser | null) {
  return createApp({ resolveUser: async () => user });
}

function request(user: SessionUser | null, path: string, init: RequestInit = {}, env: Env = adminEnv()) {
  return appFor(user, env).request(
    `${ORIGIN}${path}`,
    { ...init, headers: { origin: ORIGIN, "content-type": "application/json", ...(init.headers ?? {}) } },
    env,
  );
}

async function seed(): Promise<void> {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const tenDaysAgo = now - 10 * 86_400_000;
  const oneDayAgo = now - 86_400_000;
  const oldDelivery = now - 30 * 86_400_000;
  const sealed = await encryptSecret(webhookUrl("ownerSecret_1"), KEY);

  const statements: [string, ...unknown[]][] = [
    ["INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('owner', 'raYhan_ryd', 'o@discord.invalid', 0, ?, ?)", tenDaysAgo, tenDaysAgo],
    ["INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('reader', 'Reader', 'r@discord.invalid', 0, ?, ?)", oneDayAgo, oneDayAgo],
    ["INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES ('acct-owner', ?, 'discord', 'owner', ?, ?)", OWNER_DISCORD, tenDaysAgo, tenDaysAgo],
    ["INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES ('acct-reader', ?, 'discord', 'reader', ?, ?)", READER_DISCORD, oneDayAgo, oneDayAgo],
    ["INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES ('sess-owner', ?, 'token-owner', ?, ?, 'owner')", now + 86_400_000, tenDaysAgo, now],
    ["INSERT INTO series (id, external_id, title, feed_url, site_url, latest_chapter_label, next_check_at, last_error, active, created_at, updated_at) VALUES ('series-1', 'ADMIN01AAAAA', 'One Piece', 'f', 'u', 'Chapter 1132', ?, NULL, 1, ?, ?)", iso(now), iso(now), iso(now)],
    ["INSERT INTO series (id, external_id, title, feed_url, site_url, next_check_at, last_error, active, created_at, updated_at) VALUES ('series-2', 'ADMIN02AAAAA', 'Dandadan', 'f', 'u', ?, 'feed timeout', 1, ?, ?)", iso(now), iso(now), iso(now)],
    ["INSERT INTO series (id, external_id, title, feed_url, site_url, next_check_at, active, created_at, updated_at) VALUES ('series-3', 'ADMIN03AAAAA', 'Retired', 'f', 'u', ?, 0, ?, ?)", iso(now), iso(now), iso(now)],
    ["INSERT INTO chapters (id, series_id, chapter_number, chapter_label, title, url, discovered_at) VALUES ('chapter-1', 'series-1', 1132, 'Chapter 1132', 'The one', 'https://weebcentral.com/chapters/1', ?)", iso(now)],
    ["INSERT INTO chapters (id, series_id, chapter_number, chapter_label, title, url, discovered_at) VALUES ('chapter-2', 'series-1', 1131, 'Chapter 1131', 'The other', 'https://weebcentral.com/chapters/2', ?)", iso(now)],
    ["INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, status, created_at, updated_at) VALUES ('dest-owner', 'owner', 'Owner channel', ?, ?, 'fp-owner', 'active', ?, ?)", sealed.ciphertext, sealed.iv, iso(now), iso(now)],
    ["INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, status, created_at, updated_at) VALUES ('dest-reader', 'reader', 'Reader channel', 'cipher', 'iv', 'fp-reader', 'active', ?, ?)", iso(now), iso(now)],
    ["INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, status, created_at, updated_at) VALUES ('dest-reader-old', 'reader', 'Old channel', 'cipher', 'iv', 'fp-reader-old', 'disabled', ?, ?)", iso(now), iso(now)],
    ["INSERT INTO subscriptions (id, user_id, series_id, destination_id, active, created_at, updated_at) VALUES ('sub-owner', 'owner', 'series-1', 'dest-owner', 1, ?, ?)", iso(now), iso(now)],
    ["INSERT INTO subscriptions (id, user_id, series_id, destination_id, active, created_at, updated_at) VALUES ('sub-reader', 'reader', 'series-1', 'dest-reader', 1, ?, ?)", iso(now), iso(now)],
    ["INSERT INTO subscriptions (id, user_id, series_id, destination_id, active, created_at, updated_at) VALUES ('sub-reader-paused', 'reader', 'series-2', 'dest-reader', 0, ?, ?)", iso(now), iso(now)],
    ["INSERT INTO deliveries (id, chapter_id, destination_id, status, created_at, updated_at) VALUES ('del-sent', 'chapter-1', 'dest-owner', 'sent', ?, ?)", iso(now), iso(now)],
    ["INSERT INTO deliveries (id, chapter_id, destination_id, status, created_at, updated_at) VALUES ('del-failed', 'chapter-1', 'dest-reader', 'failed', ?, ?)", iso(now), iso(now)],
    ["INSERT INTO deliveries (id, chapter_id, destination_id, status, created_at, updated_at) VALUES ('del-pending', 'chapter-2', 'dest-reader', 'pending', ?, ?)", iso(now), iso(now)],
    ["INSERT INTO deliveries (id, chapter_id, destination_id, status, created_at, updated_at) VALUES ('del-old', 'chapter-2', 'dest-owner', 'sent', ?, ?)", iso(oldDelivery), iso(oldDelivery)],
    ["INSERT INTO job_runs (id, started_at, finished_at, status, feeds_checked, chapters_found, deliveries_sent, errors) VALUES ('run-new', ?, ?, 'ok', 4, 2, 2, 0)", iso(now - 120_000), iso(now - 60_000)],
    ["INSERT INTO job_runs (id, started_at, finished_at, status, feeds_checked, chapters_found, deliveries_sent, errors) VALUES ('run-old', ?, ?, 'error', 1, 0, 0, 1)", iso(now - 86_400_000), iso(now - 86_400_000)],
    ["INSERT INTO waitlist (id, discord_id, username, created_at) VALUES ('wait-1', '555555555555555555', 'waiting', ?)", iso(now)],
  ];

  for (const [sql, ...values] of statements) {
    await testDb.db.prepare(sql).bind(...values).run();
  }
}

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  for (const table of [
    "deliveries",
    "chapters",
    "subscriptions",
    "series",
    "destinations",
    "rate_limits",
    "waitlist",
    "job_runs",
    "session",
    "account",
    "user",
  ]) {
    await testDb.db.prepare(`DELETE FROM ${table}`).run();
  }
  await seed();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return new Response(null, { status: 204 });
      if (String(_input).includes("/api/webhooks/")) {
        return Response.json({
          id: WEBHOOK_ID,
          name: "Chapter alerts",
          channel_id: "223456789012345678",
          guild_id: "323456789012345678",
        });
      }
      return new Response(FEED, { status: 200, headers: { "content-type": "application/rss+xml" } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("admin access", () => {
  it("returns 401 when signed out", async () => {
    const res = await request(null, "/api/admin/overview");
    expect(res.status).toBe(401);
  });

  it("returns 403 to a signed-in reader who is not on the allowlist", async () => {
    const res = await request(reader, "/api/admin/overview");
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  it("returns 403 when no allowlist is configured", async () => {
    const res = await request(owner, "/api/admin/overview", {}, { ...testDb.env, ADMIN_DISCORD_IDS: "" });
    expect(res.status).toBe(403);
  });

  it("marks the owner in /api/me so the client can show the desk", async () => {
    const mine = (await (await request(owner, "/api/me")).json()) as { admin: boolean };
    const theirs = (await (await request(reader, "/api/me")).json()) as { admin: boolean };
    expect(mine.admin).toBe(true);
    expect(theirs.admin).toBe(false);
  });
});

describe("admin overview", () => {
  it("reports service totals and every account with its Discord id", async () => {
    const res = await request(owner, "/api/admin/overview");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");

    const body = (await res.json()) as {
      stats: {
        users: number;
        newUsers7d: number;
        waitlist: number;
        subscriptions: { active: number; total: number };
        series: { active: number; total: number; withErrors: number };
        destinations: { active: number; disabled: number; total: number };
        chapters: number;
        deliveries: { sent24h: number; failed24h: number; pending: number; sentTotal: number };
        cron: { lastRunAt: string | null; healthy: boolean };
      };
      users: {
        id: string;
        name: string;
        discordId: string | null;
        createdAt: string;
        lastSeenAt: string | null;
        seriesActive: number;
        seriesTotal: number;
        destinations: number;
        waitlisted: boolean;
      }[];
      topSeries: { id: string; title: string; subscribers: number }[];
      runs: { id: string; status: string; feedsChecked: number }[];
    };

    expect(body.stats.users).toBe(2);
    expect(body.stats.newUsers7d).toBe(1);
    expect(body.stats.waitlist).toBe(1);
    expect(body.stats.subscriptions).toEqual({ active: 2, total: 3 });
    expect(body.stats.series).toEqual({ active: 2, total: 3, withErrors: 1 });
    expect(body.stats.destinations).toEqual({ active: 2, disabled: 1, total: 3 });
    expect(body.stats.chapters).toBe(2);
    expect(body.stats.deliveries.sent24h).toBe(1);
    expect(body.stats.deliveries.failed24h).toBe(1);
    expect(body.stats.deliveries.pending).toBe(1);
    expect(body.stats.deliveries.sentTotal).toBe(2);
    expect(body.stats.cron.healthy).toBe(true);
    expect(Number.isNaN(new Date(body.stats.cron.lastRunAt!).getTime())).toBe(false);

    expect(body.users.map((user) => user.id)).toEqual(["reader", "owner"]);
    expect(body.users.map((user) => user.discordId)).toEqual([READER_DISCORD, OWNER_DISCORD]);
    const ownerRow = body.users.find((user) => user.id === "owner");
    expect(ownerRow?.seriesActive).toBe(1);
    expect(ownerRow?.seriesTotal).toBe(1);
    expect(ownerRow?.destinations).toBe(1);
    expect(body.users.find((user) => user.id === "reader")?.destinations).toBe(2);
    expect(ownerRow?.waitlisted).toBe(false);
    expect(ownerRow?.lastSeenAt).not.toBeNull();

    expect(body.topSeries).toEqual([{ id: "series-1", title: "One Piece", subscribers: 2 }]);
    expect(body.runs.map((run) => run.id)).toEqual(["run-new", "run-old"]);
    expect(body.runs[0]?.feedsChecked).toBe(4);
  });

  it("reports a stale cron instead of claiming health", async () => {
    await testDb.db.prepare("UPDATE job_runs SET started_at = ? WHERE id = 'run-new'").bind(
      new Date(Date.now() - 40 * 60_000).toISOString(),
    ).run();
    const body = (await (await request(owner, "/api/admin/overview")).json()) as {
      stats: { cron: { healthy: boolean } };
    };
    expect(body.stats.cron.healthy).toBe(false);
  });
});

describe("admin unlimited usage", () => {
  it("ignores the per-user series cap", async () => {
    const env = adminEnv({ MAX_SERIES_PER_USER: "2" });
    const add = (url: string, user: SessionUser = owner) =>
      request(
        user,
        "/api/series",
        { method: "POST", body: JSON.stringify({ url, destinationId: user.id === "owner" ? "dest-owner" : "dest-reader" }) },
        env,
      );

    expect((await add("https://weebcentral.com/series/ADMIN11AAAAA/Test")).status).toBe(201);
    expect((await add("https://weebcentral.com/series/ADMIN12AAAAA/Test")).status).toBe(201);

    expect((await add("https://weebcentral.com/series/READER01AAAA/Test", reader)).status).toBe(201);
    const blocked = await add("https://weebcentral.com/series/READER02AAAA/Test", reader);
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("SERIES_LIMIT");
  });

  it("ignores the per-user destination cap", async () => {
    const env = adminEnv({ MAX_DESTINATIONS_PER_USER: "1" });
    const create = (token: string) =>
      request(owner, "/api/destinations", { method: "POST", body: JSON.stringify({ webhookUrl: webhookUrl(token) }) }, env);

    expect((await create("ownerToken_1")).status).toBe(201);
    expect((await create("ownerToken_2")).status).toBe(201);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations WHERE user_id = 'owner'")).toBe(3);
  });

  it("ignores the search and preview rate limits", async () => {
    for (let attempt = 0; attempt < 11; attempt += 1) {
      const res = await request(owner, "/api/series/preview", {
        method: "POST",
        body: JSON.stringify({ url: "https://weebcentral.com/series/ADMIN21AAAAA/Test" }),
      });
      expect(res.status).toBe(200);
    }
  });

  it("ignores the test-send limit", async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const res = await request(owner, "/api/destinations/dest-owner/test", { method: "POST" });
      expect(res.status).toBe(200);
    }
  });
});
