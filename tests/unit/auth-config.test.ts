import { describe, expect, it } from "vitest";
import { AuthConfigError, createAuth } from "../../src/worker/auth";
import type { Env } from "../../src/worker/env";

const base = {
  DB: {} as D1Database,
  APP_URL: "http://localhost:8787",
  BETTER_AUTH_SECRET: "test-secret-value",
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_CLIENT_SECRET: "test-client-secret",
} satisfies Env;

describe("createAuth", () => {
  it("refuses to build without a secret", () => {
    expect(() => createAuth({ ...base, BETTER_AUTH_SECRET: "" })).toThrow(AuthConfigError);
  });

  it("refuses to build without Discord credentials", () => {
    expect(() => createAuth({ ...base, DISCORD_CLIENT_ID: "" })).toThrow(AuthConfigError);
  });

  it("takes its base URL from APP_URL, never a request header", () => {
    const auth = createAuth({ ...base, DB: {} as D1Database });
    expect(auth.options.baseURL).toBe(base.APP_URL);
    expect(auth.options.trustedOrigins).toEqual([base.APP_URL]);
  });

  it("uses identify only and synthesizes an email when Discord returns none", () => {
    const auth = createAuth({ ...base, DB: {} as D1Database, BETTER_AUTH_SECRET: "other-secret" });
    const discord = auth.options.socialProviders?.discord;
    expect(discord?.scope).toEqual(["identify"]);
    expect(discord?.disableDefaultScope).toBe(true);

    const mapProfile = discord?.mapProfileToUser;
    expect(mapProfile).toBeTypeOf("function");
    const mapped = mapProfile?.({
      id: "123456789012345678",
      username: "reader",
      global_name: null,
      avatar: null,
    } as Parameters<NonNullable<typeof mapProfile>>[0]);
    expect(mapped?.email).toBe("123456789012345678@discord.invalid");
    expect(mapped?.name).toBe("reader");
  });
});
