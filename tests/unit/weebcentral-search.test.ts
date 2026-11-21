import { describe, expect, it } from "vitest";
import { parseSearchResults, searchUrl } from "../../src/worker/lib/weebcentral";

const RESULT = (id: string, slug: string, title: string) => `
<article class="bg-base-300 flex gap-4 p-4">
    <section class="w-full lg:w-[25%]">
        <a href="https://weebcentral.com/series/${id}/${slug}">
            <article class="hidden lg:block w-full aspect-4/6  overflow-hidden">
                <picture>
                    <source srcset="https://temp.compsci88.com/cover/normal/${id}.webp" width="400" height="600" type="image/webp">
                    <img src="https://temp.compsci88.com/cover/fallback/${id}.jpg" alt="${title} cover" width="400" height="600" decoding="async">
                </picture>
            </article>
            <article class="lg:hidden relative overflow-hidden">
                <div class="text-ellipsis truncate text-white">${title}</div>
            </article>
        </a>
    </section>
</article>`;

describe("parseSearchResults", () => {
  it("reads the id, title and cover of every result", () => {
    const html = RESULT("01J76XY7E9FNDZ1DBBM6PBJPFK", "One-Piece", "One Piece") + RESULT("01J76XYCPSY3C4BNPBRY8JMCBE", "Blue-Lock", "Blue Lock");

    expect(parseSearchResults(html)).toEqual([
      {
        externalId: "01J76XY7E9FNDZ1DBBM6PBJPFK",
        title: "One Piece",
        siteUrl: "https://weebcentral.com/series/01J76XY7E9FNDZ1DBBM6PBJPFK",
        coverUrl: "https://temp.compsci88.com/cover/fallback/01J76XY7E9FNDZ1DBBM6PBJPFK.jpg",
      },
      {
        externalId: "01J76XYCPSY3C4BNPBRY8JMCBE",
        title: "Blue Lock",
        siteUrl: "https://weebcentral.com/series/01J76XYCPSY3C4BNPBRY8JMCBE",
        coverUrl: "https://temp.compsci88.com/cover/fallback/01J76XYCPSY3C4BNPBRY8JMCBE.jpg",
      },
    ]);
  });

  it("decodes entities in titles", () => {
    const html = RESULT("01J76XY7E9FNDZ1DBBM6PBJPFK", "Fate", "Fate/strange Fake &amp; More");
    expect(parseSearchResults(html)[0]?.title).toBe("Fate/strange Fake & More");
  });

  it("returns nothing for an empty page and ignores non-series links", () => {
    expect(parseSearchResults("")).toEqual([]);
    expect(parseSearchResults(`<a href="https://weebcentral.com/chapters/01ABC">x</a>`)).toEqual([]);
  });

  it("keeps one entry per series even when the markup repeats it", () => {
    const html = RESULT("01J76XY7E9FNDZ1DBBM6PBJPFK", "One-Piece", "One Piece");
    expect(parseSearchResults(html + html)).toHaveLength(1);
  });

  it("caps the list so one page cannot flood the response", () => {
    const html = Array.from({ length: 40 }, (_, index) =>
      RESULT(`01J76XY7E9FNDZ1DBBM6PBJPF${String(index).padStart(2, "0")}`, `Series-${index}`, `Series ${index}`),
    ).join("");
    expect(parseSearchResults(html)).toHaveLength(24);
  });
});

describe("searchUrl", () => {
  it("sends the query and excludes adult results", () => {
    const url = new URL(searchUrl("one piece & co"));
    expect(url.origin + url.pathname).toBe("https://weebcentral.com/search/data");
    expect(url.searchParams.get("text")).toBe("one piece & co");
    expect(url.searchParams.get("adult")).toBe("False");
  });

  it("still returns a browsable list for an empty query", () => {
    expect(new URL(searchUrl("")).searchParams.get("text")).toBe("");
  });
});
