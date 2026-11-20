import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiClientError } from "../../src/client/lib/api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

describe("api client", () => {
  it("surfaces the server error code, field, and status", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: "VALIDATION_ERROR", message: "Enter a link.", field: "url" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    const failure = api.previewSeries("nope").catch((error: unknown) => error);

    await expect(failure).resolves.toBeInstanceOf(ApiClientError);
    const error = (await failure) as ApiClientError;
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.message).toBe("Enter a link.");
    expect(error.field).toBe("url");
    expect(error.status).toBe(400);
  });

  it("builds activity filters into the query string", async () => {
    const fetchMock = stubFetch(new Response(JSON.stringify({ items: [] }), { status: 200 }));

    await api.activity({ status: "sent", seriesId: "s1", cursor: "2026-11-20T11:00:00.000Z|a1" });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]), "http://localhost");
    expect(url.pathname).toBe("/api/activity");
    expect(url.searchParams.get("status")).toBe("sent");
    expect(url.searchParams.get("seriesId")).toBe("s1");
    expect(url.searchParams.get("cursor")).toBe("2026-11-20T11:00:00.000Z|a1");
  });

  it("returns undefined for a 204 response", async () => {
    stubFetch(new Response(null, { status: 204 }));
    await expect(api.removeSeries("sub1")).resolves.toBeUndefined();
  });

  it("keeps the retry-after seconds on a 429", async () => {
    stubFetch(
      new Response(JSON.stringify({ error: { code: "RATE_LIMITED", message: "Wait a moment." } }), {
        status: 429,
        headers: { "content-type": "application/json", "retry-after": "42" },
      }),
    );

    const error = await api.testDestination("d1").catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).retryAfter).toBe(42);
  });
});
