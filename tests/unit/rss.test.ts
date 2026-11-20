import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ApiError } from "../../src/worker/lib/errors";
import { compareChapter, parseChapterNumber, parseFeed } from "../../src/worker/lib/rss";

function fixture(name: string): string {
  return readFileSync(join(process.cwd(), "tests", "fixtures", name), "utf8");
}

describe("parseFeed", () => {
  it("reads the newest item from a single-item feed", () => {
    const feed = parseFeed(fixture("feed-single.xml"));
    expect(feed.title).toBe("One Piece");
    expect(feed.latest.number).toBe(1199);
    expect(feed.latest.label).toBe("Chapter 1199");
    expect(feed.latest.url).toBe("https://weebcentral.com/chapters/01M7VE3VYYP7Y60HZE775MH0HH");
    expect(feed.latest.publishedAt).toBe("2026-11-20T02:56:04.000Z");
  });

  it("takes the first item as newest and keeps decimal chapters", () => {
    const feed = parseFeed(fixture("feed-multi.xml"));
    expect(feed.title).toBe("Blue Lock");
    expect(feed.latest.number).toBe(1089.5);
    expect(feed.latest.publishedAt).toBe("2026-11-21T10:00:00.000Z");
  });

  it("rejects an item without a chapter number", () => {
    expect(() => parseFeed(fixture("feed-no-chapter.xml"))).toThrow(ApiError);
    try {
      parseFeed(fixture("feed-no-chapter.xml"));
    } catch (error) {
      expect((error as ApiError).code).toBe("FEED_UNSUPPORTED");
    }
  });

  it("rejects an empty or malformed feed", () => {
    expect(() => parseFeed(fixture("feed-empty.xml"))).toThrow(ApiError);
    expect(() => parseFeed(fixture("feed-malformed.xml"))).toThrow(ApiError);
  });
});

describe("chapter numbers", () => {
  it("parses whole and decimal numbers", () => {
    expect(parseChapterNumber("One Piece Chapter 1199")).toBe(1199);
    expect(parseChapterNumber("Blue Lock Chapter 1089.5")).toBe(1089.5);
    expect(parseChapterNumber("Chapter 12 Extra")).toBe(12);
    expect(parseChapterNumber("Announcement")).toBeNull();
  });

  it("compares stored and latest values", () => {
    expect(compareChapter(1200, null)).toBe("new");
    expect(compareChapter(1200, 1199)).toBe("new");
    expect(compareChapter(1199, 1199)).toBe("same");
    expect(compareChapter(1198, 1199)).toBe("older");
  });
});
