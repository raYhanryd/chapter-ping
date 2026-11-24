import type { Env } from "../env";
import { ApiError } from "./errors";
import { requireUser, type AppContext, type SessionUser } from "./session";

/**
 * Discord ids allowed into /admin and exempt from every cap. It lives in a
 * Worker secret, not the database: a compromised session can never grant it.
 */
export function isAdmin(env: Env, user: SessionUser | null): boolean {
  const discordId = user?.discordId;
  if (!discordId) return false;
  const ids = (env.ADMIN_DISCORD_IDS ?? "").split(/[\s,]+/);
  return ids.includes(discordId);
}

export function requireAdmin(c: AppContext): SessionUser {
  const user = requireUser(c);
  if (!isAdmin(c.env, user)) {
    throw new ApiError("FORBIDDEN", "This page belongs to the owner account.", 403);
  }
  return user;
}
