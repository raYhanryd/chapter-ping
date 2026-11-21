import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { Env } from "./env";
import { AuthConfigError, createAuth } from "./auth";
import { accountRoutes } from "./api/account";
import { activityRoutes } from "./api/activity";
import { meRoutes } from "./api/me";
import { destinationRoutes } from "./api/destinations";
import { seriesRoutes } from "./api/series";
import { publicRoutes } from "./api/public";
import { coverRoutes } from "./api/cover";
import { ApiError, toErrorBody } from "./lib/errors";
import { runScheduled } from "./jobs";
import { publicOrigin, readConfig } from "./lib/env";
import { securityHeaders } from "./lib/security";
import { canonicalRedirect } from "./lib/canonical";
import { injectSocialMeta, seriesSocialMeta, type SeriesMetaRow } from "./lib/social";
import { resolveSessionUser, type AppContext, type AppEnv, type SessionUser } from "./lib/session";

export type { AppEnv };

type SeriesLookup = (db: D1Database, id: string) => Promise<SeriesMetaRow | null>;

const bySubscription: SeriesLookup = (db, id) =>
  db
    .prepare(
      `SELECT se.title, se.external_id, se.latest_chapter_label, se.latest_chapter_title
       FROM subscriptions s
       JOIN series se ON se.id = s.series_id
       WHERE s.id = ?`,
    )
    .bind(id)
    .first<SeriesMetaRow>();

const bySeries: SeriesLookup = (db, id) =>
  db
    .prepare(
      `SELECT title, external_id, latest_chapter_label, latest_chapter_title
       FROM series WHERE id = ?`,
    )
    .bind(id)
    .first<SeriesMetaRow>();

async function serveSeriesDocument(c: AppContext, lookup: SeriesLookup): Promise<Response> {
  const shell = await c.env.ASSETS.fetch(new URL("/index.html", c.req.url)).then((res) =>
    res.text(),
  );

  try {
    const row = await lookup(c.env.DB, c.req.param("id") ?? "");
    if (!row) return c.html(shell);

    const origin = publicOrigin(c.env);
    // Same policy as the rest of the shell: revalidate, so a new chapter or a
    // deploy shows up in the unfurl immediately instead of up to 5 minutes later.
    c.header("Cache-Control", "public, max-age=0, must-revalidate");
    return c.html(injectSocialMeta(shell, seriesSocialMeta(row, origin, c.req.path)));
  } catch {
    return c.html(shell);
  }
}

export interface AppOptions {
  /** Test seam: replace the session resolver. Production uses the Better Auth session. */
  resolveUser?: (c: Parameters<typeof resolveSessionUser>[0]) => Promise<SessionUser | null>;
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>();
  const resolveUser = options.resolveUser ?? resolveSessionUser;

  app.use("*", securityHeaders());

  app.use("*", async (c, next) => {
    const location = canonicalRedirect({
      requestUrl: c.req.url,
      pathname: c.req.path,
      publicUrl: c.env.PUBLIC_URL,
      forwardedHost: c.req.header("x-forwarded-host"),
    });
    // 302, not 301: a permanently cached redirect would strand visitors if the proxy is ever retired.
    if (location) return c.redirect(location, 302);
    await next();
  });

  app.use("/api/*", async (c, next) => {
    if (c.req.path.startsWith("/api/auth/") || c.req.path.startsWith("/api/public/")) {
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
  app.route("/api", destinationRoutes);
  app.route("/api", activityRoutes);
  app.route("/api", publicRoutes);
  app.route("/", coverRoutes);

  app.all("/api/*", (c) => {
    return c.json(toErrorBody(new ApiError("NOT_FOUND", "Not found", 404)), 404);
  });

  // Shared links unfurl with their own cover and latest chapter instead of the
  // generic card. The shell is the same document; only the marked social block
  // changes, so anything that goes wrong here still renders the app.
  app.get("/series/:id", (c) => serveSeriesDocument(c, bySubscription));
  app.get("/s/:id", (c) => serveSeriesDocument(c, bySeries));

  // Documents are routed here by assets.run_worker_first so the canonical check
  // above can run. Hand them back to the assets layer, which applies the SPA
  // fallback and public/_headers.
  app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

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

const app = createApp();

const worker: ExportedHandler<Env> = {
  fetch: app.fetch,
  scheduled(_controller, env, ctx) {
    ctx.waitUntil(runScheduled(env, fetch));
  },
};

export default worker;
