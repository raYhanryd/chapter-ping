import { ApiError } from "./errors";

export const WEEBCENTRAL_HOSTS = ["weebcentral.com", "www.weebcentral.com"] as const;
export const FEED_TIMEOUT_MS = 15_000;

const SEARCH_ENDPOINT = "https://weebcentral.com/search/data";
const SEARCH_TIMEOUT_MS = 10_000;
const SEARCH_MAX_RESULTS = 24;
const SEARCH_USER_AGENT = "ChapterPing/0.1 (+https://github.com/raYhanryd/chapter-ping)";

export interface SearchResult {
  externalId: string;
  title: string;
  siteUrl: string;
  coverUrl: string | null;
}

const SERIES_ID = /^[A-Za-z0-9]{10,40}$/;

export interface ParsedSeriesUrl {
  externalId: string;
  feedUrl: string;
  siteUrl: string;
}

function invalid(): ApiError {
  return new ApiError(
    "INVALID_SERIES_URL",
    "Paste a weebcentral series link, for example https://weebcentral.com/series/…/One-Piece.",
    400,
    "url",
  );
}

/** Accept a Weebcentral series URL (any variant) or a bare series id. */
export function parseSeriesUrl(input: string): ParsedSeriesUrl {
  const raw = input.trim();
  if (!raw) throw invalid();

  let url: URL;
  if (SERIES_ID.test(raw)) {
    url = new URL(`https://weebcentral.com/series/${raw}`);
  } else {
    try {
      url = new URL(raw);
    } catch {
      throw invalid();
    }
  }

  if (url.protocol !== "https:") throw invalid();
  if (url.username || url.password || url.port || url.hash) throw invalid();

  const host = url.hostname.toLowerCase();
  if (!(WEEBCENTRAL_HOSTS as readonly string[]).includes(host)) throw invalid();

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || parts.length > 3) throw invalid();
  if (parts[0] !== "series") throw invalid();

  const externalId = parts[1];
  if (!externalId || !SERIES_ID.test(externalId)) throw invalid();

  const siteUrl = `https://weebcentral.com/series/${externalId}`;
  return { externalId, siteUrl, feedUrl: `${siteUrl}/rss` };
}

/**
 * Weebcentral names its grid cover after the series id, at a path its own
 * search fragment uses. Derived, so a series row does not have to store it.
 */
export function seriesCoverUrl(externalId: string): string {
  return `https://temp.compsci88.com/cover/fallback/${externalId}.jpg`;
}

/** Weebcentral's own search fragment. An empty query returns a browsable list. */
export function searchUrl(query: string): string {
  const params = new URLSearchParams({
    text: query,
    sort: "Best Match",
    order: "Descending",
    official: "Any",
    anime: "Any",
    // Weebcentral accepts Any | True | False here; anything else is redirected to /400.
    adult: "False",
    display_mode: "Full Display",
  });
  return `${SEARCH_ENDPOINT}?${params.toString()}`;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  "#x27": "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    return ENTITIES[code.toLowerCase()] ?? ENTITIES[code] ?? match;
  });
}

/** The search endpoint answers with one <article> per series; read id, title and cover out of it. */
export function parseSearchResults(html: string): SearchResult[] {
  const results: SearchResult[] = [];
  const seen = new Set<string>();

  for (const block of html.split('<article class="bg-base-300')) {
    if (results.length >= SEARCH_MAX_RESULTS) break;

    const id = /href="https:\/\/weebcentral\.com\/series\/([A-Za-z0-9]{10,40})\//.exec(block)?.[1];
    if (!id || seen.has(id)) continue;

    const rawTitle =
      /<img[^>]+alt="([^"]*?) cover"/i.exec(block)?.[1] ?? /truncate[^>]*>([^<]+)</i.exec(block)?.[1];
    if (!rawTitle) continue;

    seen.add(id);
    results.push({
      externalId: id,
      title: decodeEntities(rawTitle).trim(),
      siteUrl: `https://weebcentral.com/series/${id}`,
      coverUrl: /<img[^>]+src="(https:\/\/temp\.compsci88\.com\/[^"]+)"/i.exec(block)?.[1] ?? null,
    });
  }

  return results;
}

export async function searchSeries(query: string, fetchImpl: typeof fetch = fetch): Promise<SearchResult[]> {
  let response: Response;
  try {
    response = await fetchImpl(searchUrl(query.trim().slice(0, 80)), {
      headers: { accept: "text/html", "user-agent": SEARCH_USER_AGENT },
      redirect: "manual",
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError("FEED_TIMEOUT", "Weebcentral took too long to answer the search. Try again.", 504);
    }
    throw new ApiError("FEED_UNAVAILABLE", "Weebcentral is not reachable right now. Try again.", 502);
  }

  if (response.status >= 300 && response.status < 400) {
    throw new ApiError("FEED_UNAVAILABLE", "Weebcentral redirected the search somewhere unexpected.", 502);
  }
  if (!response.ok) {
    throw new ApiError("FEED_UNAVAILABLE", "Weebcentral did not answer the search. Try again.", 502);
  }

  return parseSearchResults(await response.text());
}

/** Only https feeds on the canonical host, at the one path shape the server produces. */
export function isAllowedFeedUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password || url.port || url.hash) return false;
  const host = url.hostname.toLowerCase();
  if (!(WEEBCENTRAL_HOSTS as readonly string[]).includes(host)) return false;
  const match = /^\/series\/([A-Za-z0-9]{10,40})\/rss$/.exec(url.pathname);
  return Boolean(match);
}
