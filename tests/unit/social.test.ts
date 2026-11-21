import { describe, expect, it } from "vitest";
import {
  escapeHtml,
  injectSocialMeta,
  seriesSocialMeta,
  type SocialMeta,
} from "../../src/worker/lib/social";

const DOC = "<head><!-- social-meta:start --><title>old</title><!-- social-meta:end --></head>";

const META: SocialMeta = {
  title: "One Piece — Chapter Ping",
  description: "Chapter 1132 is out.",
  url: "https://chapterping.vercel.app/series/abc",
  imageUrl: "https://temp.compsci88.com/cover/fallback/abc.jpg",
  imageAlt: "Cover of One Piece",
};

const SERIES = {
  title: "One Piece",
  external_id: "01J76XY7E9FNDZ1DBBM6PBJPFK",
  latest_chapter_label: "Chapter 1132",
  latest_chapter_title: "The Sun God",
};

describe("social meta", () => {
  it("escapes anything that lands inside an attribute", () => {
    expect(escapeHtml('A "quoted" <tag> & more')).toBe(
      "A &quot;quoted&quot; &lt;tag&gt; &amp; more",
    );
  });

  it("replaces only the marked block", () => {
    const html = injectSocialMeta(DOC, META);

    expect(html).toBe(
      "<head><!-- social-meta:start -->\n    " +
        '<title>One Piece — Chapter Ping</title>\n    ' +
        '<meta name="description" content="Chapter 1132 is out." />\n    ' +
        '<link rel="canonical" href="https://chapterping.vercel.app/series/abc" />\n    ' +
        '<meta property="og:type" content="website" />\n    ' +
        '<meta property="og:site_name" content="Chapter Ping" />\n    ' +
        '<meta property="og:title" content="One Piece — Chapter Ping" />\n    ' +
        '<meta property="og:description" content="Chapter 1132 is out." />\n    ' +
        '<meta property="og:url" content="https://chapterping.vercel.app/series/abc" />\n    ' +
        '<meta property="og:image" content="https://temp.compsci88.com/cover/fallback/abc.jpg" />\n    ' +
        '<meta property="og:image:alt" content="Cover of One Piece" />\n    ' +
        '<meta name="twitter:card" content="summary_large_image" />\n    ' +
        '<meta name="twitter:title" content="One Piece — Chapter Ping" />\n    ' +
        '<meta name="twitter:description" content="Chapter 1132 is out." />\n    ' +
        '<meta name="twitter:image" content="https://temp.compsci88.com/cover/fallback/abc.jpg" />\n    ' +
        "<!-- social-meta:end --></head>",
    );
  });

  it("leaves a document without markers alone", () => {
    const html = "<head><title>x</title></head>";

    expect(injectSocialMeta(html, META)).toBe(html);
  });

  it("names the series, its cover and the latest chapter", () => {
    const meta = seriesSocialMeta(SERIES, "https://chapterping.vercel.app", "/series/abc");

    expect(meta.title).toBe("One Piece — Chapter Ping");
    expect(meta.description).toBe(
      "Chapter 1132 — The Sun God is out. Track One Piece and get pinged the moment the next chapter drops.",
    );
    expect(meta.imageUrl).toBe(
      "https://chapterping.vercel.app/cover/01J76XY7E9FNDZ1DBBM6PBJPFK.jpg",
    );
    expect(meta.url).toBe("https://chapterping.vercel.app/series/abc");
  });

  it("does not repeat a chapter title that already contains the label", () => {
    const meta = seriesSocialMeta(
      { ...SERIES, latest_chapter_title: "One Piece Chapter 1132" },
      "https://chapterping.vercel.app",
      "/series/abc",
    );

    expect(meta.description).toBe(
      "Chapter 1132 is out. Track One Piece and get pinged the moment the next chapter drops.",
    );
  });

  it("falls back to a generic line when no chapter is known yet", () => {
    const meta = seriesSocialMeta(
      { ...SERIES, latest_chapter_label: null, latest_chapter_title: null },
      "https://chapterping.vercel.app",
      "/series/abc",
    );

    expect(meta.description).toContain("New chapters land in Discord.");
  });
});
