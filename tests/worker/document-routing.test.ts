import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/worker";
import type { Env } from "../../src/worker/env";
import { renderAssetHeaders, SECURITY_HEADERS } from "../../src/shared/security-headers";
import { createTestDb, type TestDb } from "./helpers";

const PROXY = "https://chapterping.vercel.app";
const WORKER = "https://chapter-tracker-web.chapterping.workers.dev";
const DOCUMENT = "<!doctype html><title>Chapter Ping</title>";

let testDb: TestDb;

beforeAll(async () => {
  testDb = await createTestDb();
}, 30_000);

afterAll(async () => {
  await testDb.dispose();
});

function env(): Env {
  return {
    ...testDb.env,
    PUBLIC_URL: PROXY,
    ASSETS: {
      fetch: async () =>
        new Response(DOCUMENT, { status: 200, headers: { "content-type": "text/html" } }),
    } as unknown as Env["ASSETS"],
  };
}

function app() {
  return createApp({ resolveUser: async () => null });
}

describe("document routing", () => {
  it("redirects a direct workers.dev page hit to the public origin", async () => {
    const res = await app().request(`${WORKER}/dashboard?tab=1`, {}, env());

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${PROXY}/dashboard?tab=1`);
  });

  it("serves the document the proxy forwarded, with the cover host allowed", async () => {
    const res = await app().request(
      `${WORKER}/dashboard`,
      { headers: { "x-forwarded-host": "chapterping.vercel.app" } },
      env(),
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe(DOCUMENT);
    expect(res.headers.get("content-security-policy")).toContain("https://temp.compsci88.com");
  });

  it("keeps API routes answering on the direct origin", async () => {
    const res = await app().request(`${WORKER}/api/health`, {}, env());

    expect(res.status).toBe(200);
  });

  it("renders the static asset headers from the Worker's own definitions", () => {
    const rendered = renderAssetHeaders();

    expect(rendered.startsWith("/*\n")).toBe(true);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      expect(rendered).toContain(`  ${name}: ${value}\n`);
    }
    expect(rendered).toContain("Strict-Transport-Security: max-age=31536000");
  });
});
