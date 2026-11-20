import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../src/worker/lib/errors";
import { fetchFeed } from "../../src/worker/lib/feed-fetch";

const url = "https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK/rss";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetch(handler: (request: Request) => Response | Promise<Response>) {
  const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init)));
  vi.stubGlobal("fetch", spy);
  return spy;
}

describe("fetchFeed", () => {
  it("sends conditional headers and a browser user agent", async () => {
    const spy = mockFetch(() => new Response("<rss/>", { status: 200, headers: { etag: '"abc"' } }));
    const result = await fetchFeed(url, { etag: '"old"', lastModified: "Wed, 19 Nov 2026 00:00:00 GMT" });

    expect(result.notModified).toBe(false);
    if (!result.notModified) {
      expect(result.xml).toBe("<rss/>");
      expect(result.etag).toBe('"abc"');
    }
    const init = spy.mock.calls[0]?.[1];
    const headers = new Headers(init?.headers);
    expect(headers.get("if-none-match")).toBe('"old"');
    expect(headers.get("if-modified-since")).toBe("Wed, 19 Nov 2026 00:00:00 GMT");
    expect(headers.get("accept")).toContain("application/rss+xml");
    expect(headers.get("user-agent")).toContain("ChapterTracker");
  });

  it("reports not-modified without a body", async () => {
    mockFetch(() => new Response(null, { status: 304 }));
    const result = await fetchFeed(url, {});
    expect(result).toEqual({ notModified: true });
  });

  it("turns upstream failures into a sanitized typed error", async () => {
    mockFetch(() => new Response("nope", { status: 500 }));
    await expect(fetchFeed(url, {})).rejects.toMatchObject({ code: "FEED_UNAVAILABLE" });
  });

  it("refuses an off-allowlist URL before calling fetch", async () => {
    const spy = mockFetch(() => new Response("<rss/>"));
    await expect(fetchFeed("https://evil.example/feed", {})).rejects.toBeInstanceOf(ApiError);
    expect(spy).not.toHaveBeenCalled();
  });

  it("refuses a redirect instead of following it", async () => {
    mockFetch(() => new Response(null, { status: 302, headers: { location: "https://evil.example/" } }));
    await expect(fetchFeed(url, {})).rejects.toMatchObject({ code: "FEED_UNAVAILABLE" });
  });
});
