import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/worker";
import type { Env } from "../../src/worker/env";
import type { SessionUser } from "../../src/worker/lib/session";
import { count, createTestDb, type TestDb } from "./helpers";

const ORIGIN = "http://localhost:8787";
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title>Test Series</title>
  <link>https://weebcentral.com/series/SERIESAA01/Test-Series</link>
  <item>
    <title>Test Series Chapter 12</title>
    <link>https://weebcentral.com/chapters/abc</link>
    <pubDate>Fri, 20 Nov 2026 02:56:04 +0000</pubDate>
  </item>
</channel></rss>`;

let testDb: TestDb;
let userSeq = 0;

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  for (const table of ["deliveries", "subscriptions", "series", "rate_limits", "waitlist"]) {
    await testDb.db.prepare(`DELETE FROM ${table}`).run();
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(FEED, { status: 200, headers: { "content-type": "application/rss+xml" } })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

interface SeededUser {
  user: SessionUser;
  destinationId: string;
}

async function seedUser(): Promise<SeededUser> {
  userSeq += 1;
  const suffix = String(userSeq).padStart(2, "0");
  const id = `series-user-${suffix}`;
  const now = new Date().toISOString();
  await testDb.db
    .prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(id, `Reader ${suffix}`, `${id}@discord.invalid`, Date.now(), Date.now())
    .run();
  const destinationId = `dest-${suffix}`;
  await testDb.db
    .prepare(
      "INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, created_at, updated_at) VALUES (?, ?, ?, 'cipher', 'iv', ?, ?, ?)",
    )
    .bind(destinationId, id, `Channel ${suffix}`, `fp-${suffix}`, now, now)
    .run();
  return { user: { id, name: `Reader ${suffix}`, image: null, discordId: null }, destinationId };
}

function appFor(user: SessionUser, env: Env = testDb.env) {
  return {
    request: (path: string, init: RequestInit = {}) =>
      createApp({ resolveUser: async () => user }).request(
        `${ORIGIN}${path}`,
        { ...init, headers: { origin: ORIGIN, "content-type": "application/json", ...(init.headers ?? {}) } },
        env,
      ),
  };
}

async function addSeries(
  app: ReturnType<typeof appFor>,
  url: string,
  destinationId: string,
): Promise<Response> {
  return app.request("/api/series", { method: "POST", body: JSON.stringify({ url, destinationId }) });
}

describe("series preview", () => {
  it("returns metadata and writes no series rows", async () => {
    const { user } = await seedUser();
    const app = appFor(user);
    const res = await app.request("/api/series/preview", {
      method: "POST",
      body: JSON.stringify({ url: `https://weebcentral.com/series/SERIESAA${user.id.slice(-2)}/Test` }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { series: { title: string; latest: { number: number } }; alreadyTracked: boolean };
    expect(body.series.title).toBe("Test Series");
    expect(body.series.latest.number).toBe(12);
    expect(body.alreadyTracked).toBe(false);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series")).toBe(0);
  });

  it("rejects a non-weebcentral URL", async () => {
    const { user } = await seedUser();
    const res = await appFor(user).request("/api/series/preview", {
      method: "POST",
      body: JSON.stringify({ url: "https://evil.example/series/abcdefghij" }),
    });
    expect(res.status).toBe(400);
  });

  it("rate limits previews per user", async () => {
    const { user } = await seedUser();
    const app = appFor(user);
    const url = `https://weebcentral.com/series/SERIESBB${user.id.slice(-2)}/Test`;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await app.request("/api/series/preview", { method: "POST", body: JSON.stringify({ url }) });
      expect(res.status).toBe(200);
    }
    const limited = await app.request("/api/series/preview", { method: "POST", body: JSON.stringify({ url }) });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });
});

describe("series add", () => {
  it("stores a baseline without chapters or deliveries", async () => {
    const { user, destinationId } = await seedUser();
    const res = await addSeries(appFor(user), `https://weebcentral.com/series/SERIESCC${user.id.slice(-2)}/Test`, destinationId);
    expect(res.status).toBe(201);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM chapters")).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries")).toBe(0);
  });

  it("reuses one series row for two users", async () => {
    const first = await seedUser();
    const second = await seedUser();
    const url = "https://weebcentral.com/series/SERIESSHARED01/Test";
    expect((await addSeries(appFor(first.user), url, first.destinationId)).status).toBe(201);
    expect((await addSeries(appFor(second.user), url, second.destinationId)).status).toBe(201);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions")).toBe(2);
  });

  it("creates one series row when two users add it at the same time", async () => {
    const first = await seedUser();
    const second = await seedUser();
    const url = "https://weebcentral.com/series/RACEAA01AAAA/Test";

    const results = await Promise.all([
      addSeries(appFor(first.user), url, first.destinationId),
      addSeries(appFor(second.user), url, second.destinationId),
    ]);

    expect(results.map((res) => res.status)).toEqual([201, 201]);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions")).toBe(2);
  });

  it("rejects a concurrent duplicate add without a 500", async () => {
    const { user, destinationId } = await seedUser();
    const app = appFor(user);
    const url = "https://weebcentral.com/series/RACEBB01AAAA/Test";

    const results = await Promise.all([addSeries(app, url, destinationId), addSeries(app, url, destinationId)]);

    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series")).toBe(1);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions")).toBe(1);
  });

  it("rejects a destination owned by another user", async () => {
    const first = await seedUser();
    const second = await seedUser();
    const res = await addSeries(
      appFor(first.user),
      `https://weebcentral.com/series/SERIESDD${first.user.id.slice(-2)}/Test`,
      second.destinationId,
    );
    expect(res.status).toBe(404);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions")).toBe(0);
  });

  it("enforces the per-user series cap", async () => {
    const { user, destinationId } = await seedUser();
    const env: Env = { ...testDb.env, MAX_SERIES_PER_USER: "2" };
    const app = appFor(user, env);
    for (let index = 1; index <= 2; index += 1) {
      const res = await addSeries(app, `https://weebcentral.com/series/LIMIT${String(index).padStart(2, "0")}AAAAA/Test`, destinationId);
      expect(res.status).toBe(201);
    }
    const blocked = await addSeries(app, "https://weebcentral.com/series/LIMIT03AAAAA/Test", destinationId);
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("SERIES_LIMIT");
  });

  it("enforces the global active-series cap", async () => {
    const first = await seedUser();
    const second = await seedUser();
    const env: Env = { ...testDb.env, MAX_ACTIVE_SERIES: "1" };
    expect(
      (await addSeries(appFor(first.user, env), "https://weebcentral.com/series/GLOBAL01AAA/Test", first.destinationId)).status,
    ).toBe(201);
    const blocked = await addSeries(
      appFor(second.user, env),
      "https://weebcentral.com/series/GLOBAL02AAA/Test",
      second.destinationId,
    );
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("SERIES_CAPACITY_REACHED");
  });
});

describe("series list, pause and remove", () => {
  it("lists only the signed-in user's subscriptions", async () => {
    const first = await seedUser();
    const second = await seedUser();
    await addSeries(appFor(first.user), "https://weebcentral.com/series/LISTA01AAAA/Test", first.destinationId);
    await addSeries(appFor(second.user), "https://weebcentral.com/series/LISTB01AAAA/Test", second.destinationId);

    const res = await appFor(first.user).request("/api/series");
    const body = (await res.json()) as { items: { destination: { id: string } }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.destination.id).toBe(first.destinationId);
  });

  it("pauses and removes only the caller's subscription", async () => {
    const first = await seedUser();
    const second = await seedUser();
    const url = "https://weebcentral.com/series/PAUSE01AAAA/Test";
    await addSeries(appFor(first.user), url, first.destinationId);
    await addSeries(appFor(second.user), url, second.destinationId);

    const list = (await (await appFor(first.user).request("/api/series")).json()) as { items: { id: string }[] };
    const subscriptionId = list.items[0]?.id;
    expect(subscriptionId).toBeTruthy();

    const paused = await appFor(first.user).request(`/api/series/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    expect(paused.status).toBe(200);
    expect(
      await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions WHERE id = ? AND active = 0", subscriptionId),
    ).toBe(1);

    const resumed = await appFor(first.user).request(`/api/series/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({ active: true }),
    });
    expect(resumed.status).toBe(200);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM series WHERE active = 1")).toBe(1);

    const removed = await appFor(first.user).request(`/api/series/${subscriptionId}`, { method: "DELETE" });
    expect(removed.status).toBe(204);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions WHERE user_id = ?", first.user.id)).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM subscriptions WHERE user_id = ?", second.user.id)).toBe(1);
  });

  it("returns 404 when pausing another user's subscription", async () => {
    const first = await seedUser();
    const second = await seedUser();
    await addSeries(appFor(first.user), "https://weebcentral.com/series/ISO01AAAAA/Test", first.destinationId);
    const list = (await (await appFor(first.user).request("/api/series")).json()) as { items: { id: string }[] };
    const res = await appFor(second.user).request(`/api/series/${list.items[0]?.id}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    });
    expect(res.status).toBe(404);
  });
});
