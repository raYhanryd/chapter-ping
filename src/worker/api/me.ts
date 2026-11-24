import { Hono } from "hono";
import type { Env } from "../env";
import { isAdmin } from "../lib/admin";
import { readConfig } from "../lib/env";
import { noStore } from "../lib/security";
import { requireUser, type SessionUser } from "../lib/session";

export const meRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionUser | null } }>();

meRoutes.get("/me", async (c) => {
  const user = requireUser(c);
  noStore(c);

  const config = readConfig(c.env);
  const [accounts, activeSeries, waitlisted, profile] = await Promise.all([
    c.env.DB.prepare(
      "SELECT COUNT(DISTINCT user_id) AS count FROM subscriptions WHERE active = 1",
    ).first<{ count: number }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS count FROM series WHERE active = 1").first<{ count: number }>(),
    c.env.DB.prepare("SELECT 1 AS present FROM waitlist WHERE discord_id = ?")
      .bind(user.discordId ?? user.id)
      .first<{ present: number }>(),
    c.env.DB.prepare("SELECT created_at FROM user WHERE id = ?")
      .bind(user.id)
      .first<{ created_at: number }>(),
  ]);

  return c.json({
    user: { id: user.id, name: user.name, image: user.image },
    admin: isAdmin(c.env, user),
    createdAt: profile ? new Date(profile.created_at).toISOString() : null,
    capacity: {
      accountsUsed: accounts?.count ?? 0,
      accountsMax: config.maxAccounts,
      activeSeries: activeSeries?.count ?? 0,
      activeSeriesMax: config.maxActiveSeries,
      seriesPerUser: config.maxSeriesPerUser,
      destinationsPerUser: config.maxDestinationsPerUser,
    },
    waitlisted: Boolean(waitlisted),
  });
});
