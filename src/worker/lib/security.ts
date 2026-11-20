import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../env";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' https://cdn.discordapp.com data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  "script-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

export function securityHeaders(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    c.header("Content-Security-Policy", CONTENT_SECURITY_POLICY);
    if (c.env.ENVIRONMENT === "production") {
      c.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
  };
}

export function noStore(c: Context): void {
  c.header("Cache-Control", "private, no-store");
}
