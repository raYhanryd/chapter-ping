import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { classifyFailure, deliverDue } from "../../src/worker/jobs/deliver";
import type { Env } from "../../src/worker/env";
import { encryptSecret } from "../../src/worker/lib/crypto";
import { count, createTestDb, type TestDb } from "./helpers";

const NOW = new Date("2026-11-20T12:00:00.000Z");
const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const TOKEN = "deliverToken_123-xyz";
const WEBHOOK_URL = `https://discord.com/api/webhooks/123456789012345678/${TOKEN}`;

let testDb: TestDb;
let seq = 0;
let sendStatus = 204;
let retryAfter: string | null = null;

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  for (const table of ["deliveries", "chapters", "subscriptions", "series", "destinations", "rate_limits", "job_locks", "job_runs"]) {
    await testDb.db.prepare(`DELETE FROM ${table}`).run();
  }
  sendStatus = 204;
  retryAfter = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: sendStatus, headers: retryAfter ? { "retry-after": retryAfter } : {} })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function env(overrides: Partial<Env> = {}): Env {
  return { ...testDb.env, WEBHOOK_ENCRYPTION_KEY: KEY, ...overrides };
}

async function seedDelivery(options: {
  status?: string;
  attempts?: number;
  nextAttemptAt?: string | null;
  destinationStatus?: string;
  ciphertext?: string;
  subscriptionActive?: boolean;
} = {}): Promise<{ deliveryId: string; destinationId: string; chapterId: string }> {
  seq += 1;
  const suffix = String(seq).padStart(2, "0");
  const userId = `deliver-user-${suffix}`;
  const now = NOW.toISOString();
  await testDb.db
    .prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(userId, `Reader ${suffix}`, `${userId}@discord.invalid`, Date.now(), Date.now())
    .run();

  const encrypted = await encryptSecret(WEBHOOK_URL, KEY);
  const destinationId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, role_id, status, last_error, created_at, updated_at) VALUES (?, ?, 'Channel', ?, ?, ?, NULL, ?, 'old error', ?, ?)",
    )
    .bind(
      destinationId,
      userId,
      options.ciphertext ?? encrypted.ciphertext,
      encrypted.iv,
      crypto.randomUUID(),
      options.destinationStatus ?? "active",
      now,
      now,
    )
    .run();

  const seriesId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO series (id, external_id, title, feed_url, site_url, latest_chapter_number, latest_chapter_label, latest_chapter_title, latest_chapter_url, next_check_at, active, created_at, updated_at) VALUES (?, ?, 'One Piece', 'https://weebcentral.com/series/x/rss', 'https://weebcentral.com/series/x', 13, 'Chapter 13', 'One Piece Chapter 13', 'https://weebcentral.com/chapters/13', ?, 1, ?, ?)",
    )
    .bind(seriesId, crypto.randomUUID(), now, now, now)
    .run();

  await testDb.db
    .prepare(
      "INSERT INTO subscriptions (id, user_id, series_id, destination_id, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(crypto.randomUUID(), userId, seriesId, destinationId, options.subscriptionActive === false ? 0 : 1, now, now)
    .run();

  const chapterId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO chapters (id, series_id, chapter_number, chapter_label, title, url, published_at, discovered_at) VALUES (?, ?, 13, 'Chapter 13', 'One Piece Chapter 13', 'https://weebcentral.com/chapters/13', ?, ?)",
    )
    .bind(chapterId, seriesId, now, now)
    .run();

  const deliveryId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO deliveries (id, chapter_id, destination_id, status, attempts, next_attempt_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      deliveryId,
      chapterId,
      destinationId,
      options.status ?? "pending",
      options.attempts ?? 0,
      options.nextAttemptAt === undefined ? now : options.nextAttemptAt,
      now,
      now,
    )
    .run();

  return { deliveryId, destinationId, chapterId };
}

async function deliveryRow(id: string) {
  return testDb.db
    .prepare("SELECT status, attempts, sent_at, next_attempt_at, last_error FROM deliveries WHERE id = ?")
    .bind(id)
    .first<{ status: string; attempts: number; sent_at: string | null; next_attempt_at: string | null; last_error: string | null }>();
}

describe("classifyFailure", () => {
  it("separates dead webhooks from transient failures", () => {
    expect(classifyFailure(401)).toBe("permanent");
    expect(classifyFailure(403)).toBe("permanent");
    expect(classifyFailure(404)).toBe("permanent");
    expect(classifyFailure(429)).toBe("transient");
    expect(classifyFailure(500)).toBe("transient");
  });
});

describe("deliverDue", () => {
  it("marks a sent delivery and clears the destination error", async () => {
    const { deliveryId, destinationId } = await seedDelivery();

    const result = await deliverDue(env(), NOW, fetch);

    expect(result).toEqual({ sent: 1, retried: 0, failed: 0, skipped: 0 });
    const row = await deliveryRow(deliveryId);
    expect(row?.status).toBe("sent");
    expect(row?.attempts).toBe(1);
    expect(row?.sent_at).toBe(NOW.toISOString());
    expect(
      await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations WHERE id = ? AND status = 'active' AND last_error IS NULL", destinationId),
    ).toBe(1);
  });

  it("quarantines a dead webhook without leaking the URL", async () => {
    const { deliveryId, destinationId } = await seedDelivery();
    sendStatus = 404;

    const result = await deliverDue(env(), NOW, fetch);

    expect(result).toEqual({ sent: 0, retried: 0, failed: 1, skipped: 0 });
    const row = await deliveryRow(deliveryId);
    expect(row?.status).toBe("failed");
    expect(row?.next_attempt_at).toBeNull();

    const destination = await testDb.db
      .prepare("SELECT status, last_error FROM destinations WHERE id = ?")
      .bind(destinationId)
      .first<{ status: string; last_error: string | null }>();
    expect(destination?.status).toBe("disabled");
    expect(destination?.last_error).toBeTruthy();
    expect(destination?.last_error).not.toContain(TOKEN);
    expect(destination?.last_error).not.toContain("discord.com");
  });

  it("caps Retry-After at 60 minutes", async () => {
    const { deliveryId } = await seedDelivery();
    sendStatus = 429;
    retryAfter = "3600";

    const result = await deliverDue(env(), NOW, fetch);

    expect(result).toEqual({ sent: 0, retried: 1, failed: 0, skipped: 0 });
    const row = await deliveryRow(deliveryId);
    expect(row?.status).toBe("retry");
    const wait = new Date(row!.next_attempt_at!).getTime() - NOW.getTime();
    expect(wait).toBe(60 * 60_000);
  });

  it("backs off further after each transient failure", async () => {
    const { deliveryId } = await seedDelivery();
    sendStatus = 500;

    await deliverDue(env(), NOW, fetch);
    const first = await deliveryRow(deliveryId);
    const firstWait = new Date(first!.next_attempt_at!).getTime() - NOW.getTime();

    await testDb.db.prepare("UPDATE deliveries SET next_attempt_at = ? WHERE id = ?").bind(NOW.toISOString(), deliveryId).run();
    await deliverDue(env(), new Date(NOW.getTime() + 2 * 60_000), fetch);
    const second = await deliveryRow(deliveryId);
    const secondWait = new Date(second!.next_attempt_at!).getTime() - NOW.getTime();

    expect(second?.attempts).toBe(2);
    expect(secondWait).toBeGreaterThan(firstWait);
  });

  it("fails on the fifth attempt and stops retrying", async () => {
    const { deliveryId } = await seedDelivery({ status: "retry", attempts: 4 });
    sendStatus = 500;

    const result = await deliverDue(env(), NOW, fetch);

    expect(result).toEqual({ sent: 0, retried: 0, failed: 1, skipped: 0 });
    const row = await deliveryRow(deliveryId);
    expect(row?.status).toBe("failed");
    expect(row?.attempts).toBe(5);
    expect(row?.next_attempt_at).toBeNull();
  });

  it("never selects a sent delivery again", async () => {
    await seedDelivery({ status: "sent" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await deliverDue(env(), NOW, fetchSpy);

    expect(result).toEqual({ sent: 0, retried: 0, failed: 0, skipped: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips a disabled destination", async () => {
    const { deliveryId } = await seedDelivery({ destinationStatus: "disabled" });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await deliverDue(env(), NOW, fetchSpy);

    expect(result).toEqual({ sent: 0, retried: 0, failed: 0, skipped: 1 });
    expect((await deliveryRow(deliveryId))?.status).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails and disables the destination when decryption fails", async () => {
    const { deliveryId, destinationId } = await seedDelivery({ ciphertext: "AAAA" });

    const result = await deliverDue(env(), NOW, fetch);

    expect(result).toEqual({ sent: 0, retried: 0, failed: 1, skipped: 0 });
    expect((await deliveryRow(deliveryId))?.status).toBe("failed");
    expect(
      await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations WHERE id = ? AND status = 'disabled'", destinationId),
    ).toBe(1);
  });

  it("fails the run without touching deliveries when the encryption key is missing", async () => {
    const { deliveryId, destinationId } = await seedDelivery();
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(deliverDue(env({ WEBHOOK_ENCRYPTION_KEY: "  " }), NOW, fetchSpy)).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });

    expect((await deliveryRow(deliveryId))?.status).toBe("pending");
    expect(
      await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations WHERE id = ? AND status = 'active'", destinationId),
    ).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("skips a queued delivery after its subscription is paused", async () => {
    const { deliveryId } = await seedDelivery({ subscriptionActive: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await deliverDue(env(), NOW, fetchSpy);

    expect(result).toEqual({ sent: 0, retried: 0, failed: 0, skipped: 1 });
    expect((await deliveryRow(deliveryId))?.status).toBe("skipped");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
