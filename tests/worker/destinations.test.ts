import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../src/worker";
import type { Env } from "../../src/worker/env";
import { decryptSecret } from "../../src/worker/lib/crypto";
import type { SessionUser } from "../../src/worker/lib/session";
import { count, createTestDb, type TestDb } from "./helpers";

const ORIGIN = "http://localhost:8787";
const KEY = Buffer.from(new Uint8Array(32).fill(7)).toString("base64");
const WEBHOOK_ID = "123456789012345678";
const webhookUrl = (token = "tokenABC_123-xyz") => `https://discord.com/api/webhooks/${WEBHOOK_ID}/${token}`;

let testDb: TestDb;
let userSeq = 0;
let verifyStatus = 200;
let sendStatus = 204;
let sentBodies: unknown[] = [];

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  for (const table of ["deliveries", "chapters", "subscriptions", "series", "destinations", "rate_limits", "waitlist"]) {
    await testDb.db.prepare(`DELETE FROM ${table}`).run();
  }
  verifyStatus = 200;
  sendStatus = 204;
  sentBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        sentBodies.push(JSON.parse(String(init.body)));
        return new Response(null, { status: sendStatus });
      }
      if (verifyStatus !== 200) return new Response(null, { status: verifyStatus });
      return Response.json({
        id: WEBHOOK_ID,
        name: "Chapter alerts",
        channel_id: "223456789012345678",
        guild_id: "323456789012345678",
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function seedUser(): Promise<SessionUser> {
  userSeq += 1;
  const suffix = String(userSeq).padStart(2, "0");
  const id = `dest-user-${suffix}`;
  await testDb.db
    .prepare("INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)")
    .bind(id, `Reader ${suffix}`, `${id}@discord.invalid`, Date.now(), Date.now())
    .run();
  return { id, name: `Reader ${suffix}`, image: null, discordId: null };
}

function request(user: SessionUser, env: Partial<Env> = {}) {
  const app = createApp({ resolveUser: async () => user });
  return (path: string, init: RequestInit = {}) =>
    app.request(
      `${ORIGIN}${path}`,
      { ...init, headers: { origin: ORIGIN, "content-type": "application/json", ...(init.headers ?? {}) } },
      { ...testDb.env, WEBHOOK_ENCRYPTION_KEY: KEY, ...env },
    );
}

async function createDestination(
  call: ReturnType<typeof request>,
  body: Record<string, unknown> = {},
): Promise<{ id: string; status: string; label: string; roleId: string | null }> {
  const res = await call("/api/destinations", {
    method: "POST",
    body: JSON.stringify({ label: "My channel", webhookUrl: webhookUrl(), ...body }),
  });
  expect(res.status).toBe(201);
  const parsed = (await res.json()) as { destination: { id: string; status: string; label: string; roleId: string | null } };
  return parsed.destination;
}

describe("destination create", () => {
  it("stores an encrypted webhook and never returns it", async () => {
    const user = await seedUser();
    const call = request(user);

    const res = await call("/api/destinations", {
      method: "POST",
      body: JSON.stringify({ label: "My channel", webhookUrl: webhookUrl(), roleId: `<@&${WEBHOOK_ID}>` }),
    });
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain("tokenABC_123-xyz");
    expect(text).not.toContain("webhook_ciphertext");

    const body = JSON.parse(text) as { destination: { label: string; roleId: string; guildId: string } };
    expect(body.destination.label).toBe("My channel");
    expect(body.destination.roleId).toBe(WEBHOOK_ID);
    expect(body.destination.guildId).toBe("323456789012345678");

    const row = await testDb.db
      .prepare("SELECT webhook_ciphertext, webhook_iv FROM destinations WHERE user_id = ?")
      .bind(user.id)
      .first<{ webhook_ciphertext: string; webhook_iv: string }>();
    expect(row?.webhook_ciphertext).not.toContain("discord.com");
    expect(await decryptSecret({ ciphertext: row!.webhook_ciphertext, iv: row!.webhook_iv }, KEY)).toBe(webhookUrl());
  });

  it("rejects a deleted webhook without saving it", async () => {
    const user = await seedUser();
    verifyStatus = 404;
    const res = await request(user)("/api/destinations", {
      method: "POST",
      body: JSON.stringify({ webhookUrl: webhookUrl() }),
    });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("WEBHOOK_DEAD");
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations")).toBe(0);
  });

  it("rejects the same webhook twice", async () => {
    const user = await seedUser();
    const call = request(user);
    await createDestination(call);
    const res = await call("/api/destinations", {
      method: "POST",
      body: JSON.stringify({ webhookUrl: webhookUrl() }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("DESTINATION_EXISTS");
  });

  it("never stores the same webhook twice under concurrent requests", async () => {
    const user = await seedUser();
    const call = request(user);
    const body = JSON.stringify({ label: "My channel", webhookUrl: webhookUrl() });

    const results = await Promise.all([
      call("/api/destinations", { method: "POST", body }),
      call("/api/destinations", { method: "POST", body }),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations")).toBe(1);
  });

  it("enforces the per-user destination cap", async () => {
    const user = await seedUser();
    const call = request(user, { MAX_DESTINATIONS_PER_USER: "1" });
    await createDestination(call);
    const res = await call("/api/destinations", {
      method: "POST",
      body: JSON.stringify({ webhookUrl: webhookUrl("secondToken_123") }),
    });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("DESTINATION_LIMIT");
  });
});

describe("destination list and update", () => {
  it("lists only the caller's destinations without secrets", async () => {
    const first = await seedUser();
    const second = await seedUser();
    await createDestination(request(first));
    await createDestination(request(second));

    const res = await request(first)("/api/destinations");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("tokenABC_123-xyz");
    const body = JSON.parse(text) as { destinations: { inUseBy: number }[] };
    expect(body.destinations).toHaveLength(1);
    expect(body.destinations[0]?.inUseBy).toBe(0);
  });

  it("re-verifies a replacement URL and re-enables the destination", async () => {
    const user = await seedUser();
    const call = request(user);
    const destination = await createDestination(call);
    await testDb.db
      .prepare("UPDATE destinations SET status = 'disabled', last_error = 'old failure' WHERE id = ?")
      .bind(destination.id)
      .run();

    const res = await call(`/api/destinations/${destination.id}`, {
      method: "PATCH",
      body: JSON.stringify({ webhookUrl: webhookUrl("replacementToken_1"), roleId: "" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { destination: { status: string; roleId: string | null; lastError: string | null } };
    expect(body.destination.status).toBe("active");
    expect(body.destination.roleId).toBeNull();
    expect(body.destination.lastError).toBeNull();

    const row = await testDb.db
      .prepare("SELECT webhook_ciphertext, webhook_iv FROM destinations WHERE id = ?")
      .bind(destination.id)
      .first<{ webhook_ciphertext: string; webhook_iv: string }>();
    expect(await decryptSecret({ ciphertext: row!.webhook_ciphertext, iv: row!.webhook_iv }, KEY)).toBe(
      webhookUrl("replacementToken_1"),
    );
  });

  it("returns 404 for another user's destination", async () => {
    const owner = await seedUser();
    const stranger = await seedUser();
    const destination = await createDestination(request(owner));

    for (const [method, path] of [
      ["PATCH", `/api/destinations/${destination.id}`],
      ["DELETE", `/api/destinations/${destination.id}`],
      ["POST", `/api/destinations/${destination.id}/test`],
    ] as const) {
      const res = await request(stranger)(path, { method, body: method === "POST" ? undefined : "{}" });
      expect(res.status).toBe(404);
    }
  });
});

describe("destination delete", () => {
  it("refuses while a paused subscription still uses it", async () => {
    const user = await seedUser();
    const call = request(user);
    const destination = await createDestination(call);
    const now = new Date().toISOString();
    await testDb.db
      .prepare(
        "INSERT INTO series (id, external_id, title, feed_url, site_url, next_check_at, created_at, updated_at) VALUES ('s1', 'ext1', 'One Piece', 'f', 'u', ?, ?, ?)",
      )
      .bind(now, now, now)
      .run();
    await testDb.db
      .prepare(
        "INSERT INTO subscriptions (id, user_id, series_id, destination_id, active, created_at, updated_at) VALUES ('sub1', ?, 's1', ?, 0, ?, ?)",
      )
      .bind(user.id, destination.id, now, now)
      .run();

    const res = await call(`/api/destinations/${destination.id}`, { method: "DELETE" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("DESTINATION_IN_USE");
    expect(body.error.message).toContain("One Piece");

    await testDb.db.prepare("DELETE FROM subscriptions WHERE id = 'sub1'").run();
    const retry = await call(`/api/destinations/${destination.id}`, { method: "DELETE" });
    expect(retry.status).toBe(204);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM destinations")).toBe(0);
  });
});

describe("destination test send", () => {
  it("sends a test embed without touching chapter state", async () => {
    const user = await seedUser();
    const call = request(user);
    const destination = await createDestination(call);

    const res = await call(`/api/destinations/${destination.id}/test`, { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    expect(sentBodies).toHaveLength(1);
    const payload = sentBodies[0] as { embeds: { title: string; footer: { text: string } }[] };
    expect(payload.embeds[0]?.title.startsWith("[TEST]")).toBe(true);
    expect(payload.embeds[0]?.footer.text).toBe("Chapter Ping");

    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM chapters")).toBe(0);
    expect(await count(testDb.db, "SELECT COUNT(*) AS count FROM deliveries")).toBe(0);
  });

  it("disables a dead webhook and reports it", async () => {
    const user = await seedUser();
    const call = request(user);
    const destination = await createDestination(call);
    sendStatus = 404;

    const res = await call(`/api/destinations/${destination.id}/test`, { method: "POST" });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("WEBHOOK_DEAD");

    const row = await testDb.db
      .prepare("SELECT status, last_error FROM destinations WHERE id = ?")
      .bind(destination.id)
      .first<{ status: string; last_error: string | null }>();
    expect(row?.status).toBe("disabled");
    expect(row?.last_error).toBeTruthy();
  });

  it("rate limits test sends per destination", async () => {
    const user = await seedUser();
    const call = request(user);
    const destination = await createDestination(call);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await call(`/api/destinations/${destination.id}/test`, { method: "POST" })).status).toBe(200);
    }
    const blocked = await call(`/api/destinations/${destination.id}/test`, { method: "POST" });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("retry-after")).toBeTruthy();
  });
});
