import { MAX_DELIVERY_ATTEMPTS } from "../../shared/constants";
import type { Env } from "../env";
import { publicOrigin, readConfig } from "../lib/env";
import { ApiError, sanitizeMessage } from "../lib/errors";
import { decryptSecret } from "../lib/crypto";
import { sendWebhook } from "../lib/discord";
import { buildChapterPayload } from "../lib/payload";
import { coverPath } from "../lib/weebcentral";

const BACKOFF_MINUTES = [1, 5, 15, 60, 180];
const MAX_RETRY_AFTER_MINUTES = 60;
const JITTER_MS = 15_000;
const ERROR_MAX_LENGTH = 300;

export interface DeliverResult {
  sent: number;
  retried: number;
  failed: number;
  skipped: number;
}

interface DueDelivery {
  delivery_id: string;
  attempts: number;
  destination_id: string;
  destination_status: string;
  webhook_ciphertext: string;
  webhook_iv: string;
  role_id: string | null;
  chapter_label: string;
  chapter_url: string;
  series_title: string;
  series_external_id: string;
  subscription_active: number | null;
}

export function classifyFailure(status: number): "permanent" | "transient" {
  return status === 401 || status === 403 || status === 404 ? "permanent" : "transient";
}

function retryDelayMs(attempts: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds !== undefined) {
    return Math.min(retryAfterSeconds, MAX_RETRY_AFTER_MINUTES * 60) * 1_000;
  }
  const minutes = BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)] ?? 180;
  return minutes * 60_000 + Math.floor(Math.random() * JITTER_MS);
}

function errorMessage(error: unknown): string {
  return sanitizeMessage(error instanceof Error ? error.message : "Delivery failed.").slice(0, ERROR_MAX_LENGTH);
}

export async function deliverDue(env: Env, now: Date, fetchImpl: typeof fetch): Promise<DeliverResult> {
  const key = env.WEBHOOK_ENCRYPTION_KEY?.trim();
  if (!key) throw new ApiError("SERVICE_UNAVAILABLE", "Webhook storage is not configured yet.", 503);

  const config = readConfig(env);
  const nowIso = now.toISOString();

  const due = await env.DB.prepare(
    `SELECT d.id AS delivery_id, d.attempts,
            dst.id AS destination_id, dst.status AS destination_status,
            dst.webhook_ciphertext, dst.webhook_iv, dst.role_id,
            ch.chapter_label, ch.url AS chapter_url, se.title AS series_title,
            se.external_id AS series_external_id,
            sb.active AS subscription_active
     FROM deliveries d
     JOIN chapters ch ON ch.id = d.chapter_id
     JOIN series se ON se.id = ch.series_id
     JOIN destinations dst ON dst.id = d.destination_id
     LEFT JOIN subscriptions sb ON sb.series_id = ch.series_id AND sb.destination_id = d.destination_id
     WHERE d.status IN ('pending', 'retry') AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= ?)
     ORDER BY d.created_at
     LIMIT ?`,
  )
    .bind(nowIso, config.cronBatchDeliveries)
    .all<DueDelivery>();

  const counts: DeliverResult = { sent: 0, retried: 0, failed: 0, skipped: 0 };

  for (const delivery of due.results ?? []) {
    if (delivery.destination_status !== "active" || delivery.subscription_active !== 1) {
      await env.DB.prepare("UPDATE deliveries SET status = 'skipped', updated_at = ? WHERE id = ?")
        .bind(nowIso, delivery.delivery_id)
        .run();
      counts.skipped += 1;
      continue;
    }

    let url: string;
    try {
      url = await decryptSecret(
        { ciphertext: delivery.webhook_ciphertext, iv: delivery.webhook_iv },
        key,
      );
    } catch (error) {
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE deliveries SET status = 'failed', attempts = attempts + 1, next_attempt_at = NULL, last_error = ?, updated_at = ? WHERE id = ?",
        ).bind(errorMessage(error), nowIso, delivery.delivery_id),
        env.DB.prepare(
          "UPDATE destinations SET status = 'disabled', last_error = 'Re-add this webhook.', updated_at = ? WHERE id = ?",
        ).bind(nowIso, delivery.destination_id),
      ]);
      counts.failed += 1;
      continue;
    }

    const payload = buildChapterPayload({
      seriesTitle: delivery.series_title,
      chapterLabel: delivery.chapter_label,
      chapterUrl: delivery.chapter_url,
      roleId: delivery.role_id,
      coverUrl: `${publicOrigin(env)}${coverPath(delivery.series_external_id)}`,
      now,
    });

    try {
      await sendWebhook(url, payload, fetchImpl);
      await env.DB.batch([
        env.DB.prepare(
          "UPDATE deliveries SET status = 'sent', attempts = attempts + 1, sent_at = ?, next_attempt_at = NULL, last_error = NULL, updated_at = ? WHERE id = ?",
        ).bind(nowIso, nowIso, delivery.delivery_id),
        env.DB.prepare(
          "UPDATE destinations SET status = 'active', last_error = NULL, last_checked_at = ?, updated_at = ? WHERE id = ?",
        ).bind(nowIso, nowIso, delivery.destination_id),
      ]);
      counts.sent += 1;
    } catch (error) {
      const attempts = delivery.attempts + 1;
      const message = errorMessage(error);
      const dead = error instanceof ApiError && error.code === "WEBHOOK_DEAD";

      if (dead) {
        await env.DB.batch([
          env.DB.prepare(
            "UPDATE deliveries SET status = 'failed', attempts = ?, next_attempt_at = NULL, last_error = ?, updated_at = ? WHERE id = ?",
          ).bind(attempts, message, nowIso, delivery.delivery_id),
          env.DB.prepare(
            "UPDATE destinations SET status = 'disabled', last_error = ?, updated_at = ? WHERE id = ?",
          ).bind(message, nowIso, delivery.destination_id),
        ]);
        counts.failed += 1;
        continue;
      }

      if (attempts >= MAX_DELIVERY_ATTEMPTS) {
        await env.DB.prepare(
          "UPDATE deliveries SET status = 'failed', attempts = ?, next_attempt_at = NULL, last_error = ?, updated_at = ? WHERE id = ?",
        )
          .bind(attempts, message, nowIso, delivery.delivery_id)
          .run();
        counts.failed += 1;
        continue;
      }

      const retryAfter = error instanceof ApiError ? error.retryAfterSeconds : undefined;
      const next = new Date(now.getTime() + retryDelayMs(attempts, retryAfter)).toISOString();
      await env.DB.prepare(
        "UPDATE deliveries SET status = 'retry', attempts = ?, next_attempt_at = ?, last_error = ?, updated_at = ? WHERE id = ?",
      )
        .bind(attempts, next, message, nowIso, delivery.delivery_id)
        .run();
      counts.retried += 1;
    }
  }

  return counts;
}
