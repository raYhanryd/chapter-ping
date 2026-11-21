export interface CanonicalInput {
  requestUrl: string;
  pathname: string;
  publicUrl: string | undefined;
  forwardedHost: string | undefined;
}

/**
 * The direct workers.dev origin is not canonical: send browser traffic to the
 * public origin. API routes keep working there, and a request Vercel proxied to
 * us must never redirect or the two origins bounce off each other.
 */
export function canonicalRedirect(input: CanonicalInput): string | null {
  const { requestUrl, pathname, publicUrl, forwardedHost } = input;
  if (!publicUrl || forwardedHost) return null;
  if (pathname.startsWith("/api/")) return null;

  let current: URL;
  let target: URL;
  try {
    current = new URL(requestUrl);
    target = new URL(publicUrl);
  } catch {
    return null;
  }

  if (!current.hostname.endsWith(".workers.dev")) return null;
  if (current.host === target.host) return null;

  return `${target.origin}${current.pathname}${current.search}`;
}
