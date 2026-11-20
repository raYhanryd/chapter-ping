import { describe, expect, it } from "vitest";
import { isSameOrigin } from "../../src/worker/lib/same-origin";

const appUrl = "http://localhost:8787";

describe("isSameOrigin", () => {
  it("accepts the configured origin", () => {
    expect(isSameOrigin({ origin: appUrl, fetchSite: "same-origin", appUrl })).toBe(true);
  });

  it("accepts requests without an Origin header", () => {
    expect(isSameOrigin({ origin: undefined, fetchSite: undefined, appUrl })).toBe(true);
  });

  it("rejects a foreign origin", () => {
    expect(isSameOrigin({ origin: "https://evil.example", fetchSite: "cross-site", appUrl })).toBe(false);
  });

  it("rejects a null origin", () => {
    expect(isSameOrigin({ origin: "null", fetchSite: undefined, appUrl })).toBe(false);
  });

  it("rejects a cross-site request even without Origin", () => {
    expect(isSameOrigin({ origin: undefined, fetchSite: "cross-site", appUrl })).toBe(false);
  });

  it("rejects malformed origins and app URLs", () => {
    expect(isSameOrigin({ origin: "not a url", fetchSite: undefined, appUrl })).toBe(false);
    expect(isSameOrigin({ origin: appUrl, fetchSite: undefined, appUrl: "" })).toBe(false);
  });
});
