import type { AppContext } from "./session";
import { ApiError } from "./errors";

interface SameOriginInput {
  origin: string | undefined;
  fetchSite: string | undefined;
  appUrl: string;
}

/** Pure check so it can be tested without a request context. */
export function isSameOrigin({ origin, fetchSite, appUrl }: SameOriginInput): boolean {
  if (fetchSite === "cross-site") return false;
  if (!origin) return fetchSite === "same-origin" || fetchSite === "same-site" || fetchSite === undefined;
  if (origin === "null") return false;

  let expected: string;
  try {
    expected = new URL(appUrl).origin;
  } catch {
    return false;
  }

  try {
    return new URL(origin).origin === expected;
  } catch {
    return false;
  }
}

export function assertSameOrigin(c: AppContext): void {
  const origin = c.req.header("origin");
  const fetchSite = c.req.header("sec-fetch-site");
  // Both the direct origin and the public proxy origin are ours.
  const allowed = [c.env.PUBLIC_URL, c.env.APP_URL]
    .filter((url): url is string => Boolean(url))
    .some((appUrl) => isSameOrigin({ origin, fetchSite, appUrl }));
  if (!allowed) throw new ApiError("CROSS_ORIGIN", "Request origin is not allowed.", 403);
}
