import { Hono } from "hono";
import type { Env } from "../env";
import type { AppContext, AppEnv } from "../lib/session";
import { requireUser } from "../lib/session";
import { ApiError } from "../lib/errors";
import { assertSameOrigin } from "../lib/same-origin";
import { noStore } from "../lib/security";
import { readConfig } from "../lib/env";
import { userDestinationCount } from "../lib/capacity";
import { checkRateLimit } from "../lib/rate-limit";
import { decryptSecret, encryptSecret, sha256Hex } from "../lib/crypto";
import { normalizeRoleId, parseWebhookUrl, sendWebhook, verifyWebhook } from "../lib/discord";
import { buildTestPayload } from "../lib/payload";

export const destinationRoutes = new Hono<AppEnv>();

interface DestinationRow {
  id: string;
  label: string;
  status: "active" | "disabled";
  guild_id: string | null;
  channel_id: string | null;
  role_id: string | null;
  last_error: string | null;
  last_checked_at: string | null;
  webhook_ciphertext: string;
  webhook_iv: string;
  webhook_fingerprint: string;
}

function encryptionKey(env: Env): string {
  const key = env.WEBHOOK_ENCRYPTION_KEY?.trim();
  if (!key) throw new ApiError("SERVICE_UNAVAILABLE", "Webhook storage is not configured yet.", 503);
  return key;
}

function summary(row: DestinationRow) {
  return {
    id: row.id,
    label: row.label,
    status: row.status,
    guildId: row.guild_id,
    guildName: null,
    channelId: row.channel_id,
    channelName: null,
    roleId: row.role_id,
    lastError: row.last_error,
    lastCheckedAt: row.last_checked_at,
  };
}

function readField(body: unknown, key: string): { present: boolean; value: string } {
  if (typeof body !== "object" || body === null || !(key in body)) return { present: false, value: "" };
  const value = (body as Record<string, unknown>)[key];
  return { present: true, value: typeof value === "string" ? value.trim() : "" };
}

async function loadOwned(db: D1Database, userId: string, id: string): Promise<DestinationRow> {
  const row = await db
    .prepare("SELECT * FROM destinations WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<DestinationRow>();
  if (!row) throw new ApiError("DESTINATION_NOT_FOUND", "That destination was not found.", 404);
  return row;
}

async function writeLimit(c: AppContext): Promise<void> {
  const user = requireUser(c);
  const limit = await checkRateLimit(c.env.DB, `destinations-write:${user.id}`, 10, 60);
  if (!limit.allowed) {
    c.header("Retry-After", String(limit.retryAfter));
    throw new ApiError("RATE_LIMITED", "Too many changes. Wait a moment and try again.", 429);
  }
}

destinationRoutes.get("/destinations", async (c) => {
  const user = requireUser(c);
  noStore(c);

  const rows = await c.env.DB.prepare(
    `SELECT d.*, (SELECT COUNT(*) FROM subscriptions s WHERE s.destination_id = d.id) AS in_use_by
     FROM destinations d WHERE d.user_id = ? ORDER BY d.label COLLATE NOCASE`,
  )
    .bind(user.id)
    .all<DestinationRow & { in_use_by: number }>();

  return c.json({
    destinations: (rows.results ?? []).map((row) => ({ ...summary(row), inUseBy: row.in_use_by })),
  });
});

destinationRoutes.post("/destinations", async (c) => {
  assertSameOrigin(c);
  await writeLimit(c);
  const user = requireUser(c);
  noStore(c);

  const body: unknown = await c.req.json().catch(() => null);
  const webhookField = readField(body, "webhookUrl");
  const parsed = parseWebhookUrl(webhookField.value);
  const roleField = readField(body, "roleId");
  const roleId = normalizeRoleId(roleField.value);
  const labelField = readField(body, "label");

  const config = readConfig(c.env);
  if ((await userDestinationCount(c.env.DB, user.id)) >= config.maxDestinationsPerUser) {
    throw new ApiError(
      "DESTINATION_LIMIT",
      `You can save ${config.maxDestinationsPerUser} destinations. Remove one to add another.`,
      409,
    );
  }

  const metadata = await verifyWebhook(parsed.url);
  const fingerprint = await sha256Hex(parsed.url);
  const duplicate = await c.env.DB.prepare(
    "SELECT id FROM destinations WHERE user_id = ? AND webhook_fingerprint = ?",
  )
    .bind(user.id, fingerprint)
    .first<{ id: string }>();
  if (duplicate) throw new ApiError("DESTINATION_EXISTS", "You already saved this webhook.", 409, "webhookUrl");

  const encrypted = await encryptSecret(parsed.url, encryptionKey(c.env));
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const label = (labelField.value || metadata.name || "Discord channel").slice(0, 80);

  await c.env.DB.prepare(
    `INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint,
       guild_id, channel_id, role_id, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
  )
    .bind(
      id,
      user.id,
      label,
      encrypted.ciphertext,
      encrypted.iv,
      fingerprint,
      metadata.guildId,
      metadata.channelId,
      roleId,
      now,
      now,
    )
    .run();

  const row = await loadOwned(c.env.DB, user.id, id);
  return c.json({ destination: summary(row) }, 201);
});

destinationRoutes.patch("/destinations/:id", async (c) => {
  assertSameOrigin(c);
  await writeLimit(c);
  const user = requireUser(c);
  noStore(c);

  const existing = await loadOwned(c.env.DB, user.id, c.req.param("id"));
  const body: unknown = await c.req.json().catch(() => null);

  const labelField = readField(body, "label");
  const roleField = readField(body, "roleId");
  const urlField = readField(body, "webhookUrl");

  let label = labelField.present ? labelField.value.slice(0, 80) : existing.label;
  if (!label) label = existing.label;
  const roleId = roleField.present ? normalizeRoleId(roleField.value) : existing.role_id;

  let ciphertext = existing.webhook_ciphertext;
  let iv = existing.webhook_iv;
  let fingerprint = existing.webhook_fingerprint;
  let guildId = existing.guild_id;
  let channelId = existing.channel_id;
  let status = existing.status;
  let lastError = existing.last_error;

  if (urlField.present) {
    const parsed = parseWebhookUrl(urlField.value);
    const metadata = await verifyWebhook(parsed.url);
    const nextFingerprint = await sha256Hex(parsed.url);

    const duplicate = await c.env.DB.prepare(
      "SELECT id FROM destinations WHERE user_id = ? AND webhook_fingerprint = ? AND id <> ?",
    )
      .bind(user.id, nextFingerprint, existing.id)
      .first<{ id: string }>();
    if (duplicate) throw new ApiError("DESTINATION_EXISTS", "You already saved this webhook.", 409, "webhookUrl");

    const encrypted = await encryptSecret(parsed.url, encryptionKey(c.env));
    ciphertext = encrypted.ciphertext;
    iv = encrypted.iv;
    fingerprint = nextFingerprint;
    guildId = metadata.guildId;
    channelId = metadata.channelId;
    status = "active";
    lastError = null;
  }

  await c.env.DB.prepare(
    `UPDATE destinations SET label = ?, webhook_ciphertext = ?, webhook_iv = ?, webhook_fingerprint = ?,
       guild_id = ?, channel_id = ?, role_id = ?, status = ?, last_error = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`,
  )
    .bind(
      label,
      ciphertext,
      iv,
      fingerprint,
      guildId,
      channelId,
      roleId,
      status,
      lastError,
      new Date().toISOString(),
      existing.id,
      user.id,
    )
    .run();

  const row = await loadOwned(c.env.DB, user.id, existing.id);
  return c.json({ destination: summary(row) });
});

destinationRoutes.delete("/destinations/:id", async (c) => {
  assertSameOrigin(c);
  const user = requireUser(c);
  noStore(c);

  const existing = await loadOwned(c.env.DB, user.id, c.req.param("id"));
  const used = await c.env.DB.prepare(
    `SELECT se.title FROM subscriptions s JOIN series se ON se.id = s.series_id WHERE s.destination_id = ? LIMIT 3`,
  )
    .bind(existing.id)
    .all<{ title: string }>();

  const titles = (used.results ?? []).map((row) => row.title);
  if (titles.length > 0) {
    throw new ApiError(
      "DESTINATION_IN_USE",
      `Reassign these series first: ${titles.join(", ")}.`,
      409,
    );
  }

  await c.env.DB.prepare("DELETE FROM destinations WHERE id = ? AND user_id = ?").bind(existing.id, user.id).run();
  return c.body(null, 204);
});

destinationRoutes.post("/destinations/:id/test", async (c) => {
  assertSameOrigin(c);
  const user = requireUser(c);
  noStore(c);

  const existing = await loadOwned(c.env.DB, user.id, c.req.param("id"));
  const config = readConfig(c.env);
  const limit = await checkRateLimit(
    c.env.DB,
    `test-send:${existing.id}`,
    config.maxTestSendsPerHour,
    3600,
  );
  if (!limit.allowed) {
    c.header("Retry-After", String(limit.retryAfter));
    throw new ApiError("RATE_LIMITED", "Too many test messages. Try again later.", 429);
  }

  let url: string;
  try {
    url = await decryptSecret(
      { ciphertext: existing.webhook_ciphertext, iv: existing.webhook_iv },
      encryptionKey(c.env),
    );
  } catch (error) {
    await c.env.DB.prepare(
      "UPDATE destinations SET status = 'disabled', last_error = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
      .bind("Re-add this webhook.", new Date().toISOString(), existing.id, user.id)
      .run();
    throw error;
  }

  const now = new Date();
  try {
    await sendWebhook(url, buildTestPayload({ roleId: existing.role_id, now }));
  } catch (error) {
    const dead = error instanceof ApiError && error.code === "WEBHOOK_DEAD";
    await c.env.DB.prepare(
      "UPDATE destinations SET status = ?, last_error = ?, updated_at = ? WHERE id = ? AND user_id = ?",
    )
      .bind(dead ? "disabled" : existing.status, "Discord did not accept the test message.", now.toISOString(), existing.id, user.id)
      .run();
    throw error;
  }

  await c.env.DB.prepare(
    "UPDATE destinations SET status = 'active', last_error = NULL, last_checked_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
  )
    .bind(now.toISOString(), now.toISOString(), existing.id, user.id)
    .run();

  return c.json({ ok: true });
});
