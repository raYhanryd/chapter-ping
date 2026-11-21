import { describe, expect, it } from "vitest";
import { canonicalRedirect } from "../../src/worker/lib/canonical";

const PUBLIC_URL = "https://chapterping.vercel.app";
const WORKER = "https://chapter-tracker-web.chapterping.workers.dev";

describe("canonicalRedirect", () => {
  it("sends a direct browser hit to the public origin, keeping path and query", () => {
    expect(
      canonicalRedirect({
        requestUrl: `${WORKER}/series/abc?tab=history`,
        pathname: "/series/abc",
        publicUrl: PUBLIC_URL,
        forwardedHost: undefined,
      }),
    ).toBe("https://chapterping.vercel.app/series/abc?tab=history");
  });

  it("leaves API traffic alone so health checks and callbacks keep working", () => {
    expect(
      canonicalRedirect({
        requestUrl: `${WORKER}/api/health`,
        pathname: "/api/health",
        publicUrl: PUBLIC_URL,
        forwardedHost: undefined,
      }),
    ).toBeNull();
  });

  it("does not redirect a request Vercel proxied to us", () => {
    expect(
      canonicalRedirect({
        requestUrl: `${WORKER}/`,
        pathname: "/",
        publicUrl: PUBLIC_URL,
        forwardedHost: "chapterping.vercel.app",
      }),
    ).toBeNull();
  });

  it("does nothing without a public origin", () => {
    expect(
      canonicalRedirect({
        requestUrl: `${WORKER}/`,
        pathname: "/",
        publicUrl: undefined,
        forwardedHost: undefined,
      }),
    ).toBeNull();
  });

  it("does not touch local development or any other host", () => {
    expect(
      canonicalRedirect({
        requestUrl: "http://localhost:8787/",
        pathname: "/",
        publicUrl: PUBLIC_URL,
        forwardedHost: undefined,
      }),
    ).toBeNull();
  });

  it("does not redirect when the request already arrived on the public host", () => {
    expect(
      canonicalRedirect({
        requestUrl: `${PUBLIC_URL}/`,
        pathname: "/",
        publicUrl: PUBLIC_URL,
        forwardedHost: undefined,
      }),
    ).toBeNull();
  });
});
