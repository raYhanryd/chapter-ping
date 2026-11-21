import type { Context, MiddlewareHandler } from "hono";
import type { Env } from "../env";
import { SECURITY_HEADERS, STRICT_TRANSPORT_SECURITY } from "../../shared/security-headers";

export function securityHeaders(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    await next();
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      c.header(name, value);
    }
    if (c.env.ENVIRONMENT === "production") {
      c.header("Strict-Transport-Security", STRICT_TRANSPORT_SECURITY);
    }
  };
}

export function noStore(c: Context): void {
  c.header("Cache-Control", "private, no-store");
}
