import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { AuthConfigError, createAuth } from "../auth";
import { getDb } from "../db/client";
import { account } from "../db/schema";
import type { Env } from "../env";
import { ApiError } from "./errors";

export interface SessionUser {
  id: string;
  name: string;
  image: string | null;
  discordId: string | null;
}

export type AppEnv = { Bindings: Env; Variables: { user: SessionUser | null } };
export type AppContext = Context<AppEnv>;
export type SessionResolver = (c: AppContext) => Promise<SessionUser | null>;

/** Resolve the Better Auth session, then the Discord account id for this user. */
export const resolveSessionUser: SessionResolver = async (c) => {
  let auth;
  try {
    auth = createAuth(c.env);
  } catch (error) {
    if (error instanceof AuthConfigError) {
      throw new ApiError("SERVICE_UNAVAILABLE", "Sign-in is not configured yet.", 503);
    }
    throw error;
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return null;

  const rows = await getDb(c.env)
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, session.user.id), eq(account.providerId, "discord")))
    .limit(1);

  return {
    id: session.user.id,
    name: session.user.name,
    image: session.user.image ?? null,
    discordId: rows[0]?.accountId ?? null,
  };
};

export function requireUser(c: AppContext): SessionUser {
  const user = c.get("user");
  if (!user) throw new ApiError("UNAUTHORIZED", "Sign in to continue.", 401);
  return user;
}
