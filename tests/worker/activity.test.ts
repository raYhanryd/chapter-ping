import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../src/worker";
import type { SessionUser } from "../../src/worker/lib/session";
import { createTestDb, type TestDb } from "./helpers";

const ORIGIN = "http://localhost:8787";
const NOW = new Date("2026-11-20T12:00:00.000Z");
const TOKEN = "activityToken_123-xyz";

let testDb: TestDb;
let seq = 0;

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
});

interface Account {
  user: SessionUser;
  destinationId: string;
}

async function seedAccount(): Promise<Account> {
  seq += 1;
  const id = `activity-user-${seq}`;
  const now = NOW.toISOString();
  await testDb.db
    .prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(id, `Reader ${seq}`, `${id}@discord.invalid`, Date.now(), Date.now())
    .run();
  const destinationId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO destinations (id, user_id, label, webhook_ciphertext, webhook_iv, webhook_fingerprint, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'iv', ?, 'active', ?, ?)",
    )
    .bind(destinationId, id, `Channel ${seq}`, `https://discord.com/api/webhooks/123456789012345678/${TOKEN}`, crypto.randomUUID(), now, now)
    .run();
  return { user: { id, name: `Reader ${seq}`, image: null, discordId: null }, destinationId };
}

async function addDelivery(
  account: Account,
  options: { status?: string; createdAt?: string; sentAt?: string | null } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  const now = NOW.toISOString();
  const createdAt = options.createdAt ?? now;
  const seriesId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO series (id, external_id, title, feed_url, site_url, latest_chapter_number, latest_chapter_label, latest_chapter_title, latest_chapter_url, next_check_at, active, created_at, updated_at) VALUES (?, ?, 'One Piece', 'https://weebcentral.com/series/x/rss', 'https://weebcentral.com/series/x', 13, 'Chapter 13', 'One Piece Chapter 13', 'https://weebcentral.com/chapters/13', ?, 1, ?, ?)",
    )
    .bind(seriesId, crypto.randomUUID(), now, now, now)
    .run();
  const chapterId = crypto.randomUUID();
  await testDb.db
    .prepare(
      "INSERT INTO chapters (id, series_id, chapter_number, chapter_label, title, url, discovered_at) VALUES (?, ?, 13, 'Chapter 13', 'One Piece Chapter 13', 'https://weebcentral.com/chapters/13', ?)",
    )
    .bind(chapterId, seriesId, now)
    .run();
  await testDb.db
    .prepare(
      "INSERT INTO deliveries (id, chapter_id, destination_id, status, attempts, last_error, sent_at, created_at, updated_at) VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?)",
    )
    .bind(id, chapterId, account.destinationId, options.status ?? "sent", options.sentAt ?? null, createdAt, createdAt)
    .run();
  return id;
}

function appFor(user: SessionUser) {
  const app = createApp({ resolveUser: async () => user });
  return (path: string) =>
    app.request(`${ORIGIN}${path}`, { headers: { origin: ORIGIN } }, testDb.env);
}

interface ActivityBody {
  items: {
    id: string;
    status: string;
    sentAt: string | null;
    createdAt: string;
    chapter: { title: string; number: number };
    series: { title: string };
    destination: { label: string };
  }[];
  nextCursor?: string;
}

describe("GET /api/activity", () => {
  it("returns only the caller's deliveries, newest first", async () => {
    const owner = await seedAccount();
    const stranger = await seedAccount();
    await addDelivery(owner, { createdAt: "2026-11-20T10:00:00.000Z" });
    await addDelivery(owner, { createdAt: "2026-11-20T11:00:00.000Z" });
    await addDelivery(stranger);

    const res = await appFor(owner.user)("/api/activity");

    expect(res.status).toBe(200);
    const body = (await res.json()) as ActivityBody;
    expect(body.items).toHaveLength(2);
    expect(body.items[0]?.createdAt).toBe("2026-11-20T11:00:00.000Z");
    expect(body.items.every((item) => item.series.title === "One Piece")).toBe(true);
  });

  it("renders every delivery status without exposing the webhook", async () => {
    const account = await seedAccount();
    for (const status of ["pending", "sent", "retry", "failed", "skipped"]) {
      await addDelivery(account, { status });
    }

    const res = await appFor(account.user)("/api/activity?limit=50");
    const text = await res.text();

    expect(res.status).toBe(200);
    expect(text).not.toContain(TOKEN);
    expect(text).not.toContain("discord.com");
    const body = JSON.parse(text) as ActivityBody;
    expect(new Set(body.items.map((item) => item.status))).toEqual(
      new Set(["pending", "sent", "retry", "failed", "skipped"]),
    );
  });

  it("omits rows older than 30 days", async () => {
    const account = await seedAccount();
    await addDelivery(account, { createdAt: "2026-10-01T00:00:00.000Z" });
    await addDelivery(account, { createdAt: NOW.toISOString() });

    const body = (await (await appFor(account.user)("/api/activity")).json()) as ActivityBody;

    expect(body.items).toHaveLength(1);
  });

  it("pages with the cursor without repeating a row", async () => {
    const account = await seedAccount();
    for (const hour of ["08", "09", "10"]) {
      await addDelivery(account, { createdAt: `2026-11-20T${hour}:00:00.000Z` });
    }

    const first = (await (await appFor(account.user)("/api/activity?limit=2")).json()) as ActivityBody;
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();

    const second = (await (
      await appFor(account.user)(`/api/activity?limit=2&cursor=${encodeURIComponent(first.nextCursor!)}`)
    ).json()) as ActivityBody;

    expect(second.items).toHaveLength(1);
    const firstIds = new Set(first.items.map((item) => item.id));
    expect(second.items.some((item) => firstIds.has(item.id))).toBe(false);
  });

  it("caps a page at 50 items", async () => {
    const account = await seedAccount();
    for (let index = 0; index < 51; index += 1) {
      await addDelivery(account, {
        createdAt: new Date(NOW.getTime() - index * 1_000).toISOString(),
      });
    }

    const body = (await (await appFor(account.user)("/api/activity?limit=999")).json()) as ActivityBody;

    expect(body.items).toHaveLength(50);
    expect(body.nextCursor).toBeTruthy();
  });
});
