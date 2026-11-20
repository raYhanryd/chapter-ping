import { ApiError } from "./errors";
import type { DiscordWebhookBody } from "./payload";

export const DISCORD_WEBHOOK_HOSTS = ["discord.com", "discordapp.com", "canary.discord.com", "ptb.discord.com"] as const;
export const WEBHOOK_TIMEOUT_MS = 10_000;

const USER_AGENT = "ChapterPing/0.1 (+https://github.com/raYhanryd/chapter-ping)";
const SNOWFLAKE = /^\d{17,20}$/;
const TOKEN = /^[A-Za-z0-9_-]{5,120}$/;

export interface ParsedWebhook {
  url: string;
  id: string;
  token: string;
  host: string;
}

export interface WebhookMetadata {
  name: string | null;
  guildId: string | null;
  channelId: string | null;
}

function invalidWebhook(): ApiError {
  return new ApiError(
    "INVALID_WEBHOOK_URL",
    "Paste the full Discord webhook URL from Channel settings, Integrations, Webhooks.",
    400,
    "webhookUrl",
  );
}

export function parseWebhookUrl(input: string): ParsedWebhook {
  const raw = input.trim();
  if (!raw) throw invalidWebhook();

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw invalidWebhook();
  }

  if (url.protocol !== "https:") throw invalidWebhook();
  if (url.username || url.password || url.port || url.hash) throw invalidWebhook();

  const host = url.hostname.toLowerCase();
  if (!(DISCORD_WEBHOOK_HOSTS as readonly string[]).includes(host)) throw invalidWebhook();

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 4 || parts[0] !== "api" || parts[1] !== "webhooks") throw invalidWebhook();

  const id = parts[2] ?? "";
  const token = parts[3] ?? "";
  if (!SNOWFLAKE.test(id) || !TOKEN.test(token)) throw invalidWebhook();

  return { url: `https://${host}/api/webhooks/${id}/${token}`, id, token, host };
}

export function normalizeRoleId(input?: string | null): string | null {
  const raw = input?.trim() ?? "";
  if (!raw) return null;

  const mention = /^<@&(\d{17,20})>$/.exec(raw);
  if (mention?.[1]) return mention[1];
  if (SNOWFLAKE.test(raw)) return raw;

  throw new ApiError("INVALID_ROLE_ID", "Paste a role ID or a role mention like <@&123…>.", 400, "roleId");
}

function unavailable(): ApiError {
  return new ApiError("WEBHOOK_UNAVAILABLE", "Discord did not answer. Check the webhook and try again.", 502);
}

export async function verifyWebhook(url: string, fetchImpl: typeof fetch = fetch): Promise<WebhookMetadata> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json", "user-agent": USER_AGENT },
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new ApiError("WEBHOOK_DEAD", "Discord says this webhook is deleted or invalid. Create a new one.", 400, "webhookUrl");
  }
  if (!response.ok) throw unavailable();

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw unavailable();
  }
  if (typeof data !== "object" || data === null) throw unavailable();

  const record = data as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : null,
    guildId: typeof record.guild_id === "string" ? record.guild_id : null,
    channelId: typeof record.channel_id === "string" ? record.channel_id : null,
  };
}

export async function sendWebhook(
  url: string,
  body: DiscordWebhookBody,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImpl(`${url}?wait=true`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": USER_AGENT },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });
  } catch {
    throw unavailable();
  }

  if (response.ok) return;

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    throw new ApiError("WEBHOOK_DEAD", "Discord rejected this webhook. Replace it to keep alerts.", 502);
  }
  if (response.status === 429) {
    const header = response.headers.get("retry-after");
    const seconds = header !== null && /^\d+$/.test(header) ? Number(header) : undefined;
    throw new ApiError("WEBHOOK_UNAVAILABLE", "Discord is rate limiting messages. We will retry.", 429, undefined, seconds);
  }
  throw unavailable();
}
