const DEFAULT_NEXT = "/dashboard";

/** Only a plain same-site path may survive a login round trip. */
export function safeNextPath(raw: string | null | undefined): string {
  const lower = raw?.toLowerCase() ?? "";
  if (
    !raw ||
    lower === "/login" ||
    lower.startsWith("/login/") ||
    lower.startsWith("/login?") ||
    lower.startsWith("/login#") ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    [...raw].some((char) => char === "\\" || char.charCodeAt(0) < 0x20)
  ) {
    return DEFAULT_NEXT;
  }
  return raw;
}
