import { describe, expect, it } from "vitest";
import { clientAddress, edgeAddress } from "../../src/worker/lib/client-ip";

const PUBLIC = "https://chapterping.vercel.app";
const headers = (init: Record<string, string>) => new Headers(init);

describe("clientAddress", () => {
  it("uses the forwarded client when the proxy host is ours", () => {
    expect(
      clientAddress(
        headers({
          "x-forwarded-host": "chapterping.vercel.app",
          "x-forwarded-for": "188.70.46.167",
          "cf-connecting-ip": "13.207.68.147",
        }),
        PUBLIC,
      ),
    ).toBe("188.70.46.167");
  });

  it("takes the first hop when the proxy appends its own address", () => {
    expect(
      clientAddress(
        headers({
          "x-forwarded-host": "chapterping.vercel.app",
          "x-forwarded-for": "203.0.113.7, 76.76.21.21",
        }),
        PUBLIC,
      ),
    ).toBe("203.0.113.7");
  });

  it("ignores a forwarded host that is not ours", () => {
    expect(
      clientAddress(
        headers({
          "x-forwarded-host": "evil.example",
          "x-forwarded-for": "1.2.3.4",
          "cf-connecting-ip": "192.0.2.50",
        }),
        PUBLIC,
      ),
    ).toBe("192.0.2.50");
  });

  it("ignores a forwarded chain when no public origin is configured", () => {
    expect(
      clientAddress(
        headers({
          "x-forwarded-host": "chapterping.vercel.app",
          "x-forwarded-for": "1.2.3.4",
          "cf-connecting-ip": "192.0.2.50",
        }),
      ),
    ).toBe("192.0.2.50");
  });

  it("never trusts x-real-ip, which the proxy sets to its own address", () => {
    expect(
      clientAddress(
        headers({
          "x-forwarded-host": "chapterping.vercel.app",
          "x-real-ip": "10.0.0.9",
          "cf-connecting-ip": "192.0.2.50",
        }),
        PUBLIC,
      ),
    ).toBe("192.0.2.50");
  });

  it("falls back to the Cloudflare address for a malformed chain", () => {
    expect(
      clientAddress(
        headers({
          "x-forwarded-host": "chapterping.vercel.app",
          "x-forwarded-for": "not-an-ip",
          "x-real-ip": "10.0.0.9",
          "cf-connecting-ip": "192.0.2.50",
        }),
        PUBLIC,
      ),
    ).toBe("192.0.2.50");
  });

  it("keeps IPv6 addresses and survives nothing at all", () => {
    expect(
      clientAddress(
        headers({ "x-forwarded-host": "chapterping.vercel.app", "x-forwarded-for": "2001:db8::1" }),
        PUBLIC,
      ),
    ).toBe("2001:db8::1");
    expect(clientAddress(headers({}))).toBe("unknown");
    expect(edgeAddress(headers({}))).toBe("unknown");
  });
});
