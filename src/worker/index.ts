import { Hono } from "hono";
import type { Env } from "./env";
import { ApiError, toErrorBody } from "./lib/errors";
import { readConfig } from "./lib/env";
import { securityHeaders } from "./lib/security";

const app = new Hono<{ Bindings: Env }>();

app.use("*", securityHeaders());

app.get("/api/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT 1 AS ok").first();
    return c.json({ ok: true, db: "ok" });
  } catch {
    return c.json({ ok: false, db: "error" }, 503);
  }
});

app.get("/api/status", async (c) => {
  const config = readConfig(c.env);
  try {
    const accounts = await c.env.DB.prepare(
      "SELECT COUNT(DISTINCT user_id) AS count FROM subscriptions WHERE active = 1",
    ).first<{ count: number }>();
    const activeSeries = await c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM series WHERE active = 1",
    ).first<{ count: number }>();

    const accountsUsed = accounts?.count ?? 0;
    const active = activeSeries?.count ?? 0;

    return c.json({
      acceptingUsers: accountsUsed < config.maxAccounts,
      accountsUsed,
      accountsMax: config.maxAccounts,
      activeSeries: active,
      activeSeriesMax: config.maxActiveSeries,
    });
  } catch {
    return c.json(
      {
        acceptingUsers: false,
        accountsUsed: 0,
        accountsMax: config.maxAccounts,
        activeSeries: 0,
        activeSeriesMax: config.maxActiveSeries,
      },
      503,
    );
  }
});

app.all("/api/*", (c) => {
  return c.json(toErrorBody(new ApiError("NOT_FOUND", "Not found", 404)), 404);
});

export default app;
