const IPV4 = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const IPV6 = /^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}$/i;

function isIp(value: string): boolean {
  return IPV4.test(value) || IPV6.test(value);
}

/**
 * The address to rate-limit on.
 *
 * Behind the Vercel rewrite `cf-connecting-ip` is Vercel's egress address, so
 * every visitor would share one bucket. The proxy's forwarded chain carries the
 * real client. Only trust it when the request actually came through a proxy
 * (`x-forwarded-host`); a direct workers.dev caller can set any header, so there
 * the unspoofable Cloudflare address wins.
 */
export function clientAddress(headers: Headers): string {
  if (headers.get("x-forwarded-host")) {
    const first = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    if (isIp(first)) return first;

    const real = headers.get("x-real-ip")?.trim() ?? "";
    if (isIp(real)) return real;
  }

  return headers.get("cf-connecting-ip")?.trim() || "unknown";
}
