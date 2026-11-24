import { describe, expect, it } from "vitest";
import { isAdmin } from "../../src/worker/lib/admin";
import type { Env } from "../../src/worker/env";
import type { SessionUser } from "../../src/worker/lib/session";

const OWNER = "1245083537015570573";
const env = (ids?: string): Env =>
  ({ APP_URL: "http://localhost:8787", ...(ids === undefined ? {} : { ADMIN_DISCORD_IDS: ids }) }) as Env;

const user = (discordId: string | null): SessionUser => ({
  id: "user-1",
  name: "Reader",
  image: null,
  discordId,
});

describe("admin allowlist", () => {
  it("grants nothing when ADMIN_DISCORD_IDS is unset", () => {
    expect(isAdmin(env(), user(OWNER))).toBe(false);
    expect(isAdmin(env(""), user(OWNER))).toBe(false);
  });

  it("matches the configured Discord id", () => {
    expect(isAdmin(env(OWNER), user(OWNER))).toBe(true);
    expect(isAdmin(env("111111111111111111"), user(OWNER))).toBe(false);
  });

  it("tolerates commas, spaces and newlines around ids", () => {
    expect(isAdmin(env(` 111111111111111111 ,\n ${OWNER} \n`), user(OWNER))).toBe(true);
  });

  it("requires an exact id, not a prefix", () => {
    expect(isAdmin(env("124508353701557057"), user(OWNER))).toBe(false);
  });

  it("never grants admin to a user without a Discord account", () => {
    expect(isAdmin(env(OWNER), user(null))).toBe(false);
  });
});
