/**
 * One definition for both layers. The Worker sets these on its own responses,
 * and the build writes the same set into dist/client/_headers, because static
 * assets are served without ever reaching the Worker.
 *
 * This module must stay dependency-free and free of Worker globals: vite.config.ts
 * imports it, and the build config is typechecked without Cloudflare types.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' https://cdn.discordapp.com https://temp.compsci88.com data:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "connect-src 'self'",
  "script-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join("; ");

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
};

export const STRICT_TRANSPORT_SECURITY = "max-age=31536000; includeSubDomains";

/** Body of the static-asset `_headers` file that ships in dist/client. */
export function renderAssetHeaders(): string {
  const lines = ["/*"];
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    lines.push(`  ${name}: ${value}`);
  }
  lines.push(`  Strict-Transport-Security: ${STRICT_TRANSPORT_SECURITY}`);
  return `${lines.join("\n")}\n`;
}
