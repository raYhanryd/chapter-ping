import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { AuthConfigError, createAuth } from "./auth";
import { accountRoutes } from "./api/account";
import { meRoutes } from "./api/me";
import { seriesRoutes } from "./api/series";
import { ApiError, toErrorBody } from "./lib/errors";
import { readConfig } from "./lib/env";
import { securityHeaders } from "./lib/security";
import { resolveSessionUser, type AppEnv, type SessionUser } from "./lib/session";

export type { AppEnv };

export interface AppOptions {
  /** Test seam: replace the session resolver. Production uses the Better Auth session. */
  resolveUser?: (c: Parameters<typeof resolveSessionUser>[0]) => Promise<SessionUser | null>;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>();
  const resolveUser = options.resolveUser ?? resolveSessionUser;

  app.use("*", securityHeaders());

  app.use("/api/*", async (c, next) => {
    if (c.req.path.startsWith("/api/auth/")) {
      await next();
      return;
    }
    c.set("user", await resolveUser(c));
    await next();
  });

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
      const accounts = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM user").first<{ count: number }>();
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

  app.on(["GET", "POST"], "/api/auth/*", async (c) => {
    try {
      return await createAuth(c.env).handler(c.req.raw);
    } catch (error) {
      if (error instanceof AuthConfigError) {
        return c.json(
          { error: { code: "SERVICE_UNAVAILABLE", message: "Sign-in is not configured yet." } },
          503,
        );
      }
      throw error;
    }
  });

  app.route("/api", meRoutes);
  app.route("/api", accountRoutes);
  app.route("/api", seriesRoutes);

  app.all("/api/*", (c) => {
    return c.json(toErrorBody(new ApiError("NOT_FOUND", "Not found", 404)), 404);
  });

  app.onError((error, c) => {
    if (error instanceof ApiError) {
      return c.json(toErrorBody(error), error.status as ContentfulStatusCode);
    }
    const message = error instanceof Error ? error.message : "unknown error";
    // Never log a request URL or body here: both can carry a webhook secret.
    console.error(`Unhandled API error: ${error instanceof Error ? error.name : "Error"}: ${message.replace(/https?:\/\/\S+/g, "[redacted]")}`);
    return c.json(toErrorBody(new ApiError("INTERNAL_ERROR", "Something went wrong. Try again.", 500)), 500);
  });

  return app;
}

export default createApp();
