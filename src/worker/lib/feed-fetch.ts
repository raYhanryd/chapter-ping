import { ApiError } from "./errors";
import { FEED_TIMEOUT_MS, isAllowedFeedUrl } from "./weebcentral";

const USER_AGENT = "ChapterTrackerWeb/0.1 (+https://github.com/raYhanryd/chapter-tracker-web)";
const ACCEPT = "application/rss+xml, application/xml, text/xml";

export interface FeedFetchOptions {
  etag?: string | null;
  lastModified?: string | null;
  fetchImpl?: typeof fetch;
}

export type FeedFetchResult =
  | { notModified: true }
  | { notModified: false; xml: string; etag: string | null; lastModified: string | null };

export async function fetchFeed(url: string, options: FeedFetchOptions = {}): Promise<FeedFetchResult> {
  if (!isAllowedFeedUrl(url)) {
    throw new ApiError("INVALID_SERIES_URL", "That feed address is not a weebcentral series feed.", 400);
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const headers: Record<string, string> = { accept: ACCEPT, "user-agent": USER_AGENT };
  if (options.etag) headers["if-none-match"] = options.etag;
  if (options.lastModified) headers["if-modified-since"] = options.lastModified;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ApiError("FEED_TIMEOUT", "Weebcentral took too long to respond. We will retry.", 504);
    }
    throw new ApiError("FEED_UNAVAILABLE", "Weebcentral is not reachable right now. We will retry.", 502);
  }

  if (response.status === 304) return { notModified: true };

  if (response.status >= 300 && response.status < 400) {
    throw new ApiError("FEED_UNAVAILABLE", "Weebcentral redirected the feed somewhere unexpected.", 502);
  }

  if (!response.ok) {
    throw new ApiError("FEED_UNAVAILABLE", "Weebcentral did not return a feed. We will retry.", 502);
  }

  const xml = await response.text();
  if (!xml.trim()) {
    throw new ApiError("FEED_INVALID", "Weebcentral returned an empty feed.", 422);
  }

  return {
    notModified: false,
    xml,
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
  };
}
