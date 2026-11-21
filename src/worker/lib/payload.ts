const EMBED_COLOR = 0xe67e22;

export interface DiscordEmbed {
  title: string;
  url?: string;
  description: string;
  color: number;
  timestamp: string;
  footer: { text: string };
  thumbnail?: { url: string };
}

export interface DiscordWebhookBody {
  content?: string;
  allowed_mentions?: { parse: []; roles: string[] };
  embeds: DiscordEmbed[];
}

function roleFields(roleId: string | null): Pick<DiscordWebhookBody, "content" | "allowed_mentions"> {
  if (!roleId) return {};
  return { content: `<@&${roleId}>`, allowed_mentions: { parse: [], roles: [roleId] } };
}

export interface ChapterPayloadInput {
  seriesTitle: string;
  chapterLabel: string;
  chapterUrl: string;
  roleId: string | null;
  coverUrl?: string | null;
  now: Date;
}

export function buildChapterPayload({
  seriesTitle,
  chapterLabel,
  chapterUrl,
  roleId,
  coverUrl,
  now,
}: ChapterPayloadInput): DiscordWebhookBody {
  return {
    ...roleFields(roleId),
    embeds: [
      {
        title: `${seriesTitle} ${chapterLabel}`,
        url: chapterUrl,
        description: `A new chapter of ${seriesTitle} is out.`,
        color: EMBED_COLOR,
        timestamp: now.toISOString(),
        footer: { text: "Chapter Ping" },
        ...(coverUrl ? { thumbnail: { url: coverUrl } } : {}),
      },
    ],
  };
}

export function buildTestPayload({ roleId, now }: { roleId: string | null; now: Date }): DiscordWebhookBody {
  return {
    ...roleFields(roleId),
    embeds: [
      {
        title: "[TEST] Chapter Ping is connected",
        description: "This channel will get a message when a tracked series gets a new chapter.",
        color: EMBED_COLOR,
        timestamp: now.toISOString(),
        footer: { text: "Chapter Ping" },
      },
    ],
  };
}
