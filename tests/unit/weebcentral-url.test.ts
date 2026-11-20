import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/worker/lib/errors";
import { parseSeriesUrl } from "../../src/worker/lib/weebcentral";

const id = "01J76XY7E9FNDZ1DBBM6PBJPFK";
const canonical = `https://weebcentral.com/series/${id}`;

function rejects(input: string) {
  expect(() => parseSeriesUrl(input)).toThrow(ApiError);
}

describe("parseSeriesUrl", () => {
  it("accepts the canonical series URL and normalizes to the feed", () => {
    const parsed = parseSeriesUrl(`${canonical}/One-Piece`);
    expect(parsed.externalId).toBe(id);
    expect(parsed.siteUrl).toBe(canonical);
    expect(parsed.feedUrl).toBe(`${canonical}/rss`);
  });

  it("accepts www, bare id, trailing slash, query and rss variants", () => {
    expect(parseSeriesUrl(`https://www.weebcentral.com/series/${id}`).externalId).toBe(id);
    expect(parseSeriesUrl(id).externalId).toBe(id);
    expect(parseSeriesUrl(`${canonical}/`).externalId).toBe(id);
    expect(parseSeriesUrl(`${canonical}?x=1`).externalId).toBe(id);
    expect(parseSeriesUrl(`${canonical}/rss`).externalId).toBe(id);
    expect(parseSeriesUrl(`https://WEEBCENTRAL.COM/series/${id}`).externalId).toBe(id);
  });

  it("rejects other hosts, schemes, credentials, ports and fragments", () => {
    rejects(`http://weebcentral.com/series/${id}`);
    rejects(`https://evil.com/series/${id}`);
    rejects(`https://weebcentral.com.evil.com/series/${id}`);
    rejects(`https://user:pass@weebcentral.com/series/${id}`);
    rejects(`https://weebcentral.com:8443/series/${id}`);
    rejects(`${canonical}#frag`);
  });

  it("rejects chapter paths and bad ids", () => {
    rejects(`https://weebcentral.com/chapters/${id}`);
    rejects("https://weebcentral.com/series/");
    rejects("https://weebcentral.com/series/short");
    rejects("https://weebcentral.com/series/not_alnum_id_at_all");
    rejects("");
  });
});
