import { ApiError } from "./errors";

export const WEEBCENTRAL_HOSTS = ["weebcentral.com", "www.weebcentral.com"] as const;
export const FEED_TIMEOUT_MS = 15_000;

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
