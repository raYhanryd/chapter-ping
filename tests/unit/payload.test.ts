import { describe, expect, it } from "vitest";
import { buildChapterPayload, buildTestPayload } from "../../src/worker/lib/payload";

const now = new Date("2026-11-20T12:00:00.000Z");
const chapter = {
  seriesTitle: "One Piece",
  chapterLabel: "Chapter 1199",
  chapterTitle: "One Piece Chapter 1199",
  chapterUrl: "https://weebcentral.com/chapters/abc",
};

describe("buildChapterPayload", () => {
  it("omits mentions when no role is configured", () => {
    const payload = buildChapterPayload({ ...chapter, roleId: null, now });
    expect(payload.content).toBeUndefined();
    expect(payload.allowed_mentions).toBeUndefined();
  });

  it("mentions only the configured role", () => {
    const payload = buildChapterPayload({ ...chapter, roleId: "123456789012345678", now });
    expect(payload.content).toBe("<@&123456789012345678>");
    expect(payload.allowed_mentions).toEqual({ parse: [], roles: ["123456789012345678"] });
  });

  it("builds the embed with the brief's fields", () => {
    const payload = buildChapterPayload({ ...chapter, roleId: null, now });
    const embed = payload.embeds[0]!;
    expect(embed.title).toBe("One Piece Chapter 1199");
    expect(embed.url).toBe(chapter.chapterUrl);
    expect(embed.description).toContain("One Piece");
    expect(embed.color).toBe(0xe67e22);
    expect(embed.timestamp).toBe(now.toISOString());
    expect(embed.footer.text).toBe("Chapter Tracker");
  });

  it("marks test sends and keeps them out of chapter state", () => {
    const payload = buildTestPayload({ roleId: null, now });
    const embed = payload.embeds[0]!;
    expect(embed.title.startsWith("[TEST]")).toBe(true);
    expect(embed.color).toBe(0xe67e22);
    expect(embed.footer.text).toBe("Chapter Tracker");
  });
});
