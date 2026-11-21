import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/worker";
import type { SessionUser } from "../../src/worker/lib/session";
import { createTestDb, type TestDb } from "./helpers";

const ORIGIN = "http://localhost:8787";

const RESULTS = `
<article class="bg-base-300 flex gap-4 p-4">
    <section class="w-full lg:w-[25%]">
        <a href="https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/One-Piece">
            <picture>
                <img src="https://temp.compsci88.com/cover/fallback/01J76XY7E9FNDZ1DBBM6PBJPFK.jpg" alt="One Piece cover">
            </picture>
        </a>
    </section>
</article>`;

let testDb: TestDb;
const user: SessionUser = { id: "search-user", name: "Search Reader", image: null, discordId: null };

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  for (const table of ["rate_limits", "subscriptions", "series"]) {
    await testDb.db.prepare(`DELETE FROM ${table}`).run();
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(RESULTS, { status: 200, headers: { "content-type": "text/html" } })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function app() {
  return createApp({ resolveUser: async () => user });
}

describe("series search", () => {
  it("returns parsed results for the query", async () => {
    const res = await app().request(`${ORIGIN}/api/series/search?q=one%20piece`, {}, testDb.env);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { items: { externalId: string; title: string }[] };
    expect(body.items).toEqual([
      expect.objectContaining({
        externalId: "01J76XY7E9FNDZ1DBBM6PBJPFK",
        title: "One Piece",
        siteUrl: "https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK",
      }),
    ]);

    const called = String((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]?.[0]);
    expect(called).toContain("weebcentral.com/search/data");
    expect(called).toContain("text=one+piece");
  });

  it("browses with an empty query", async () => {
    const res = await app().request(`${ORIGIN}/api/series/search`, {}, testDb.env);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { items: unknown[] }).items).toHaveLength(1);
  });

  it("requires a session", async () => {
    const anonymous = createApp({ resolveUser: async () => null });
    const res = await anonymous.request(`${ORIGIN}/api/series/search?q=naruto`, {}, testDb.env);
    expect(res.status).toBe(401);
  });

  it("rate limits searches per user", async () => {
    const instance = app();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect((await instance.request(`${ORIGIN}/api/series/search?q=a`, {}, testDb.env)).status).toBe(200);
    }
    const limited = await instance.request(`${ORIGIN}/api/series/search?q=a`, {}, testDb.env);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
  });

  it("reports an unreachable source instead of an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 503 })));
    const res = await app().request(`${ORIGIN}/api/series/search?q=a`, {}, testDb.env);
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("FEED_UNAVAILABLE");
  });
});
