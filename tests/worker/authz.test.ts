import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/worker";
import type { Env } from "../../src/worker/env";
import type { SessionUser } from "../../src/worker/lib/session";
import { count, createTestDb, type TestDb } from "./helpers";

const userA: SessionUser = {
  id: "user-a",
  name: "Reader A",
  image: null,
  discordId: "111111111111111111",
};
const userB: SessionUser = {
  id: "user-b",
  name: "Reader B",
  image: null,
  discordId: "222222222222222222",
};

let testDb: TestDb;

async function seed(): Promise<void> {
  const now = Date.now();
  const statements = [
    ["INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)", "user-a", "Reader A", "a@discord.invalid", now, now],
    ["INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)", "user-b", "Reader B", "b@discord.invalid", now, now],
    ["INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, 'discord', ?, ?, ?)", "acct-a", userA.discordId, "user-a", now, now],
    ["INSERT INTO account (id, account_id, provider_id, user_id, created_at, updated_at) VALUES (?, ?, 'discord', ?, ?, ?)", "acct-b", userB.discordId, "user-b", now, now],
    ["INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)", "sess-a", now + 86_400_000, "token-a", now, now, "user-a"],
    ["INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?)", "sess-b", now + 86_400_000, "token-b", now, now, "user-b"],
    ["INSERT INTO series (id, external_id, title, feed_url, site_url, next_check_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", "series-1", "series-1", "One Piece", "https://weebcentral.com/series/series-1/rss", "https://weebcentral.com/series/series-1/One-Piece", new Date(now + 60_000).toISOString(), new Date(now).toISOString(), new Date(now).toISOString()],
    ["INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", "dest-a", "user-a", "A channel", "cipher", "iv", "fp-a", new Date(now).toISOString(), new Date(now).toISOString()],
    ["INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", "dest-b", "user-b", "B channel", "cipher", "iv", "fp-b", new Date(now).toISOString(), new Date(now).toISOString()],
    ["INSERT INTO subscriptions (id, user_id, series_id, destination_id, created_at, updated_at) VALUES (?, ?, 'series-1', ?, ?, ?)", "sub-a", "user-a", "dest-a", new Date(now).toISOString(), new Date(now).toISOString()],
    ["INSERT INTO subscriptions (id, user_id, series_id, destination_id, created_at, updated_at) VALUES (?, ?, 'series-1', ?, ?, ?)", "sub-b", "user-b", "dest-b", new Date(now).toISOString(), new Date(now).toISOString()],
    ["INSERT INTO chapters (id, series_id, chapter_number, chapter_label, title, url, discovered_at) VALUES (?, 'series-1', 1100, '1100', 'Chapter 1100', 'https://weebcentral.com/chapter/1', ?)", "chapter-1", new Date(now).toISOString()],
    ["INSERT INTO deliveries (id, chapter_id, destination_id, status, created_at, updated_at) VALUES (?, 'chapter-1', ?, 'sent', ?, ?)", "del-a", "dest-a", new Date(now).toISOString(), new Date(now).toISOString()],
    ["INSERT INTO deliveries (id, chapter_id, destination_id, status, created_at, updated_at) VALUES (?, 'chapter-1', ?, 'sent', ?, ?)", "del-b", "dest-b", new Date(now).toISOString(), new Date(now).toISOString()],
    ["INSERT INTO waitlist (id, discord_id, username, created_at) VALUES (?, ?, ?, ?)", "wait-a", userA.discordId, "reader-a", new Date(now).toISOString()],
  ] as const;

  for (const [sql, ...values] of statements) {
    await testDb.db.prepare(sql).bind(...values).run();
  }
}

function appFor(user: SessionUser | null) {
  return createApp({ resolveUser: async () => user });
}

function deleteRequest(
  app: ReturnType<typeof createApp>,
  origin = "http://localhost:8787",
  confirm = "DELETE",
  env: Env = testDb.env,
) {
  return app.request(
    "http://localhost:8787/api/account/delete",
    {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ confirm }),
    },
    env,
  );
}

beforeAll(async () => {
  testDb = await createTestDb();
  await seed();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

describe("session gating", () => {
  it("returns 401 from /api/me when signed out", async () => {
    const res = await appFor(null).request("http://localhost:8787/api/me", {}, testDb.env);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the signed-in user with private caching", async () => {
    const res = await appFor(userA).request("http://localhost:8787/api/me", {}, testDb.env);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = (await res.json()) as {
      user: { id: string; name: string };
      capacity: { accountsMax: number };
      waitlisted: boolean;
      createdAt: string;
    };
    expect(body.user).toEqual({ id: "user-a", name: "Reader A", image: null });
    expect(body.capacity.accountsMax).toBe(100);
    expect(body.waitlisted).toBe(true);
    expect(Number.isNaN(new Date(body.createdAt).getTime())).toBe(false);
  });
});

describe("account deletion", () => {
  it("rejects a foreign origin and changes nothing", async () => {
    const before = await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations");
    const res = await deleteRequest(appFor(userA), "https://evil.example");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("CROSS_ORIGIN");
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations")).toBe(before);
  });

  it("accepts the public proxy origin once PUBLIC_URL is set", async () => {
    const env: Env = { ...testDb.env, PUBLIC_URL: "https://chapterping.vercel.app" };
    const res = await deleteRequest(appFor(userA), "https://chapterping.vercel.app", "delete", env);
    // 400 means the origin check passed and only the confirmation word was wrong.
    expect(res.status).toBe(400);
  });

  it("still rejects the proxy origin when PUBLIC_URL is not set", async () => {
    const res = await deleteRequest(appFor(userA), "https://chapterping.vercel.app", "delete");
    expect(res.status).toBe(403);
  });

  it("rejects the wrong confirmation word", async () => {
    const res = await deleteRequest(appFor(userA), "http://localhost:8787", "delete");
    expect(res.status).toBe(400);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM user WHERE id = 'user-a'")).toBe(1);
  });

  it("deletes only the requesting user's rows", async () => {
    const res = await deleteRequest(appFor(userA));
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toContain("better-auth.session_token=");
    expect(res.headers.get("set-cookie")).toMatch(/__Secure-better-auth\.session_token=;[^,]*Secure/);

    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM user WHERE id = 'user-a'")).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM user WHERE id = 'user-b'")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations WHERE user_id = 'user-a'")).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations WHERE user_id = 'user-b'")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions WHERE user_id = 'user-a'")).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions WHERE user_id = 'user-b'")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries WHERE destination_id = 'dest-a'")).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries WHERE destination_id = 'dest-b'")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM session WHERE user_id = 'user-a'")).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM waitlist WHERE discord_id = ?", userA.discordId)).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series WHERE id = 'series-1'")).toBe(1);
  });

  it("removes a waitlist entry keyed by user id when Discord is not linked", async () => {
    const now = Date.now();
    await testDb.db
      .prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('user-c', 'Reader C', 'c@discord.invalid', 0, ?, ?)")
      .bind(now, now)
      .run();
    await testDb.db
      .prepare("INSERT INTO waitlist (id, discord_id, username, created_at) VALUES ('wait-c', 'user-c', 'reader-c', ?)")
      .bind(new Date(now).toISOString())
      .run();

    const res = await deleteRequest(appFor({ id: "user-c", name: "Reader C", image: null, discordId: null }));

    expect(res.status).toBe(204);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM waitlist WHERE discord_id = 'user-c'")).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM user WHERE id = 'user-c'")).toBe(0);
  });

  it("does not let a signed-out request delete anything", async () => {
    const res = await deleteRequest(appFor(null));
    expect(res.status).toBe(401);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM user WHERE id = 'user-b'")).toBe(1);
  });
});
