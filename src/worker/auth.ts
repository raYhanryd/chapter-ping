import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db/client";
import * as schema from "./db/schema";
import type { Env } from "./env";

export class AuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigError";
  }
}

const cache = new WeakMap<Env, ReturnType<typeof buildAuth>>();

function buildAuth(env: Env) {
  const secret = env.BETTER_AUTH_SECRET?.trim();
  const clientId = env.DISCORD_CLIENT_ID?.trim();
  const clientSecret = env.DISCORD_CLIENT_SECRET?.trim();

  if (!secret) throw new AuthConfigError("BETTER_AUTH_SECRET is not set");
  if (!clientId || !clientSecret) {
    throw new AuthConfigError("DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are required for sign-in");
  }
  if (!env.APP_URL) throw new AuthConfigError("APP_URL is not set");

  return betterAuth({
    baseURL: env.APP_URL,
    secret,
    database: drizzleAdapter(getDb(env), { provider: "sqlite", schema }),
    socialProviders: {
      discord: {
        clientId,
        clientSecret,
        disableDefaultScope: true,
        scope: ["identify"],
        mapProfileToUser: (profile) => ({
          // identify does not return an email, and Better Auth requires one.
          email: `${profile.id}@discord.invalid`,
          name: profile.global_name ?? profile.username ?? "Discord member",
          image:
            typeof profile.avatar === "string" && profile.avatar.length > 0
              ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png`
              : undefined,
        }),
      },
    },
    trustedOrigins: [env.APP_URL],
  });
}

/** Better Auth instance for this isolate, built per env object. Throws AuthConfigError when unconfigured. */
export function createAuth(env: Env) {
  const existing = cache.get(env);
  if (existing) return existing;
  const auth = buildAuth(env);
  cache.set(env, auth);
  return auth;
}
