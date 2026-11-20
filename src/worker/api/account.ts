import { Hono } from "hono";
import type { Env } from "../env";
import { ApiError } from "../lib/errors";
import { assertSameOrigin } from "../lib/same-origin";
import { noStore } from "../lib/security";
import { requireUser, type SessionUser } from "../lib/session";

export const accountRoutes = new Hono<{ Bindings: Env; Variables: { user: SessionUser | null } }>();

accountRoutes.post("/account/delete", async (c) => {
  assertSameOrigin(c);
  const user = requireUser(c);
  noStore(c);

  const body: unknown = await c.req.json().catch(() => null);
  const confirm =
    typeof body === "object" && body !== null && "confirm" in body
      ? (body as { confirm?: unknown }).confirm
      : undefined;

  if (confirm !== "DELETE") {
    throw new ApiError("VALIDATION_ERROR", 'Type DELETE to confirm account deletion.', 400, "confirm");
  }

  const statements = [
    c.env.DB.prepare(
      "DELETE FROM deliveries WHERE destination_id IN (SELECT id FROM destinations WHERE user_id = ?)",
    ).bind(user.id),
    c.env.DB.prepare("DELETE FROM subscriptions WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM destinations WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM session WHERE user_id = ?").bind(user.id),
    c.env.DB.prepare("DELETE FROM account WHERE user_id = ?").bind(user.id),
  ];
  if (user.discordId) {
    statements.push(c.env.DB.prepare("DELETE FROM waitlist WHERE discord_id = ?").bind(user.discordId));
  }
  statements.push(c.env.DB.prepare("DELETE FROM user WHERE id = ?").bind(user.id));

  await c.env.DB.batch(statements);

  for (const name of ["better-auth.session_token", "__Secure-better-auth.session_token"]) {
    c.header("Set-Cookie", `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`, { append: true });
  }

  return c.body(null, 204);
});
