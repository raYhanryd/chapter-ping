import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/worker";
import { createTestDb, type TestDb } from "./helpers";

const ORIGIN = "http://localhost:8787";
const EXTERNAL_ID = "01J76XY7E9FNDZ1DBBM6PBJPFK";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
  testDb.env.PUBLIC_URL = ORIGIN;
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.db.prepare("DELETE FROM rate_limits").run();
});

function app() {
  return createApp({ resolveUser: async () => null });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cover proxy", () => {
  it("streams the cover from our origin with a long cache", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await app().request(`${ORIGIN}/cover/${EXTERNAL_ID}.jpg`, {}, testDb.env);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
    expect((await res.arrayBuffer()).byteLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://temp.compsci88.com/cover/fallback/${EXTERNAL_ID}.jpg`,
      expect.anything(),
    );
  });

  it("stops fetching for one visitor after the cover budget", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(new Uint8Array([1]), { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const application = app();
    const headers = { "x-forwarded-host": "localhost:8787", "x-forwarded-for": "203.0.113.7" };

    for (let i = 0; i < 60; i += 1) {
      const res = await application.request(`${ORIGIN}/cover/${EXTERNAL_ID}.jpg?n=${i}`, { headers }, testDb.env);
      expect(res.status).toBe(200);
    }

    const limited = await application.request(`${ORIGIN}/cover/${EXTERNAL_ID}.jpg?n=61`, { headers }, testDb.env);

    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(60);
  });

  it("refuses an id that is not a series id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await app().request(`${ORIGIN}/cover/short.jpg`, {}, testDb.env);

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s when the upstream answers with something other than an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 200, headers: { "content-type": "text/html" } })),
    );

    const res = await app().request(`${ORIGIN}/cover/${EXTERNAL_ID}.jpg`, {}, testDb.env);

    expect(res.status).toBe(404);
  });

  it("404s when the upstream is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("upstream down");
      }),
    );

    const res = await app().request(`${ORIGIN}/cover/${EXTERNAL_ID}.jpg`, {}, testDb.env);

    expect(res.status).toBe(404);
  });
});
