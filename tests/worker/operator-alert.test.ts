import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../src/worker/env";
import { alertOperator } from "../../src/worker/lib/operator-alert";
import { createTestDb, type TestDb } from "./helpers";

const WEBHOOK = "https://discord.com/api/webhooks/123456789012345678/test-token";
const NOW = new Date("2026-11-21T12:00:00.000Z");

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

beforeEach(async () => {
  await testDb.db.prepare("DELETE FROM rate_limits").run();
});

function env(alertWebhookUrl?: string): Env {
  return { ...testDb.env, ALERT_WEBHOOK_URL: alertWebhookUrl };
}

describe("alertOperator", () => {
  it("does nothing when no alert webhook is configured", async () => {
    const fetchImpl = vi.fn();

    const sent = await alertOperator(env(), "cron failed", { now: NOW, fetchImpl });

    expect(sent).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts the message to the configured webhook", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    const sent = await alertOperator(env(WEBHOOK), "cron failed", { now: NOW, fetchImpl });

    expect(sent).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(WEBHOOK);
    expect(JSON.parse(String(init.body))).toEqual({ content: "[Chapter Ping] cron failed" });
  });

  it("sends at most one alert per hour", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 204 }));

    expect(await alertOperator(env(WEBHOOK), "first", { now: NOW, fetchImpl })).toBe(true);
    expect(
      await alertOperator(env(WEBHOOK), "second", {
        now: new Date(NOW.getTime() + 60_000),
        fetchImpl,
      }),
    ).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("swallows a failing webhook so the cron keeps its own error", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });

    await expect(alertOperator(env(WEBHOOK), "cron failed", { now: NOW, fetchImpl })).resolves.toBe(
      false,
    );
  });
});
