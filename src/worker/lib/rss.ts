import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ApiError } from "./errors";

const CHAPTER_PATTERN = /Chapter\s+(\d+(?:\.\d+)?)/i;

export interface ParsedChapter {
  number: number;
  label: string;
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface ParsedFeed {
  title: string;
  siteUrl: string | null;
  latest: ParsedChapter;
}

interface FeedItem {
  title?: unknown;
  link?: unknown;
  pubDate?: unknown;
}

function asText(value: unknown): string | null {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

function invalid(message: string): ApiError {
  return new ApiError("FEED_INVALID", message, 422);
}

export function parseChapterNumber(title: string): number | null {
  const match = CHAPTER_PATTERN.exec(title);
  if (!match) return null;
  const value = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(value) ? value : null;
}

export function parseFeed(xml: string): ParsedFeed {
  if (!xml.trim()) throw invalid("Weebcentral returned an empty feed.");

  const validated = XMLValidator.validate(xml);
  if (validated !== true) throw invalid("Weebcentral returned a feed we could not read.");

  const parsed: unknown = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml);
  const channel = readChannel(parsed);
  if (!channel) throw invalid("Weebcentral returned a feed we could not read.");

  const title = asText(channel.title);
  if (!title) throw invalid("The feed is missing a series title.");

  const items = channel.item;
  const first = Array.isArray(items) ? items[0] : items;
  if (!first || typeof first !== "object") throw invalid("This series feed has no chapters yet.");

  const item = first as FeedItem;
  const itemTitle = asText(item.title);
  const url = asText(item.link);
  if (!itemTitle || !url) throw invalid("The newest feed item is missing a title or link.");

  const number = parseChapterNumber(itemTitle);
  if (number === null) {
    throw new ApiError(
      "FEED_UNSUPPORTED",
      "The newest chapter has no chapter number, so this series cannot be tracked yet.",
      422,
    );
  }

  const publishedRaw = asText(item.pubDate);
  const published = publishedRaw ? new Date(publishedRaw) : null;
  const publishedAt = published && !Number.isNaN(published.getTime()) ? published.toISOString() : null;

  return {
    title,
    siteUrl: asText(channel.link),
    latest: { number, label: `Chapter ${number}`, title: itemTitle, url, publishedAt },
  };
}

function readChannel(value: unknown): { title?: unknown; link?: unknown; item?: unknown } | null {
  if (typeof value !== "object" || value === null || !("rss" in value)) return null;
  const rss = (value as { rss?: unknown }).rss;
  if (typeof rss !== "object" || rss === null || !("channel" in rss)) return null;
  const channel = (rss as { channel?: unknown }).channel;
  if (typeof channel !== "object" || channel === null) return null;
  return channel as { title?: unknown; link?: unknown; item?: unknown };
}

export type ChapterComparison = "new" | "same" | "older";

export function compareChapter(latest: number, stored: number | null): ChapterComparison {
  if (stored === null) return "new";
  if (latest > stored) return "new";
  if (latest === stored) return "same";
  return "older";
}
