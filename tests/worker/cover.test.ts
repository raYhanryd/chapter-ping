import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/worker";
import type { Env } from "../../src/worker/env";

const ORIGIN = "http://localhost:8787";
const EXTERNAL_ID = "01J76XY7E9FNDZ1DBBM6PBJPFK";

const env = { DB: {} as D1Database, APP_URL: ORIGIN } as Env;

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

    const res = await app().request(`${ORIGIN}/cover/${EXTERNAL_ID}.jpg`, {}, env);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toContain("max-age=86400");
    expect((await res.arrayBuffer()).byteLength).toBe(3);
    expect(fetchMock).toHaveBeenCalledWith(
      `https://temp.compsci88.com/cover/fallback/${EXTERNAL_ID}.jpg`,
      expect.anything(),
    );
  });

  it("refuses an id that is not a series id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await app().request(`${ORIGIN}/cover/short.jpg`, {}, env);

    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("404s when the upstream answers with something other than an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 200, headers: { "content-type": "text/html" } })),
    );

    const res = await app().request(`${ORIGIN}/cover/${EXTERNAL_ID}.jpg`, {}, env);

    expect(res.status).toBe(404);
  });

  it("404s when the upstream is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("upstream down");
      }),
    );

    const res = await app().request(`${ORIGIN}/cover/${EXTERNAL_ID}.jpg`, {}, env);

    expect(res.status).toBe(404);
  });
});
