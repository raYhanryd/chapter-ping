const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}$/i;

function isIp(value: string): boolean {
  return IPV4.test(value) || IPV6.test(value);
}

/** The address Cloudflare saw; behind the proxy that is the proxy itself. */
export function edgeAddress(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim() || "unknown";
}

/**
 * The visitor's address, only when the proxy vouched for it.
 *
 * Vercel sends `x-forwarded-host` (our public host) and a single-entry
 * `x-forwarded-for` (the client), while `x-real-ip` and `cf-connecting-ip` hold
 * Vercel's own egress — trusting `x-real-ip` would put every visitor in one
 * bucket. A chain counts only when the forwarded host is our configured public
 * host; anything else is a direct caller setting its own headers.
 */
export function forwardedAddress(
  headers: Headers,
  publicUrl: string | null | undefined,
): string | null {
  const host = headers.get("x-forwarded-host")?.trim().toLowerCase();
  if (!host || !publicUrl) return null;

  let expected: string;
  try {
    expected = new URL(publicUrl).host.toLowerCase();
  } catch {
    return null;
  }
  if (host !== expected) return null;

  const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  return isIp(first) ? first : null;
}

export function clientAddress(headers: Headers, publicUrl?: string | null): string {
  return forwardedAddress(headers, publicUrl) ?? edgeAddress(headers);
}
