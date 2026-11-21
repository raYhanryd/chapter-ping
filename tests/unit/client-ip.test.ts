import { describe, expect, it } from "vitest";
import { clientAddress } from "../../src/worker/lib/client-ip";

const headers = (init: Record<string, string>) => new Headers(init);

describe("clientAddress", () => {
  it("uses the first forwarded hop behind the proxy", () => {
    expect(
      clientAddress(
        headers({
          "x-forwarded-host": "chapterping.vercel.app",
          "x-forwarded-for": "203.0.113.7, 76.76.21.21",
          "cf-connecting-ip": "76.76.21.21",
        }),
      ),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when the chain is missing or malformed", () => {
    expect(
      clientAddress(headers({ "x-forwarded-host": "chapterping.vercel.app", "x-real-ip": "198.51.100.9" })),
    ).toBe("198.51.100.9");
    expect(
      clientAddress(
        headers({
          "x-forwarded-host": "chapterping.vercel.app",
          "x-forwarded-for": "not-an-ip",
          "x-real-ip": "198.51.100.9",
        }),
      ),
    ).toBe("198.51.100.9");
  });

  it("ignores forwarded headers on a direct hit so they cannot be spoofed", () => {
    expect(
      clientAddress(
        headers({
          "x-forwarded-for": "1.2.3.4",
          "x-real-ip": "1.2.3.4",
          "cf-connecting-ip": "192.0.2.50",
        }),
      ),
    ).toBe("192.0.2.50");
  });

  it("keeps IPv6 addresses and falls back to unknown", () => {
    expect(
      clientAddress(headers({ "x-forwarded-host": "x", "x-forwarded-for": "2001:db8::1" })),
    ).toBe("2001:db8::1");
    expect(clientAddress(headers({}))).toBe("unknown");
  });
});
