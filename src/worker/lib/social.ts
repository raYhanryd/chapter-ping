import { seriesCoverUrl } from "./weebcentral";

const START = "<!-- social-meta:start -->";
const END = "<!-- social-meta:end -->";

export interface SocialMeta {
  title: string;
  description: string;
  url: string;
  imageUrl: string;
  imageAlt: string;
  imageWidth?: number;
  imageHeight?: number;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The tags Discord, Slack and Twitter read. They must be absolute URLs. */
export function renderSocialMeta(meta: SocialMeta): string {
  const tags = [
    `<title>${escapeHtml(meta.title)}</title>`,
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Chapter Ping" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta property="og:image" content="${escapeHtml(meta.imageUrl)}" />`,
    `<meta property="og:image:alt" content="${escapeHtml(meta.imageAlt)}" />`,
    meta.imageWidth ? `<meta property="og:image:width" content="${meta.imageWidth}" />` : "",
    meta.imageHeight ? `<meta property="og:image:height" content="${meta.imageHeight}" />` : "",
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(meta.imageUrl)}" />`,
  ].filter(Boolean);

  return [START, ...tags, END].join("\n    ");
}

/**
 * Swap the marked block in the built index.html for page-specific tags. The
 * static file keeps the generic card, so a miss here degrades to a normal link.
 */
export function injectSocialMeta(html: string, meta: SocialMeta): string {
  const start = html.indexOf(START);
  if (start === -1) return html;
  const end = html.indexOf(END, start);
  if (end === -1) return html;
  return `${html.slice(0, start)}${renderSocialMeta(meta)}${html.slice(end + END.length)}`;
}

export interface SeriesMetaRow {
  title: string;
  external_id: string;
  latest_chapter_label: string | null;
  latest_chapter_title: string | null;
}

export function seriesSocialMeta(row: SeriesMetaRow, origin: string, path: string): SocialMeta {
  const label = row.latest_chapter_label?.trim() ?? "";
  const chapterTitle = row.latest_chapter_title?.trim() ?? "";
  // Weebcentral often titles a chapter after itself ("One Piece Chapter 1199"),
  // so only add the title when it says something the label does not.
  const repeatsLabel =
    chapterTitle.length > 0 && chapterTitle.toLowerCase().includes(label.toLowerCase());

  const latest = !label
    ? "New chapters land in Discord."
    : chapterTitle && !repeatsLabel
      ? `${label} — ${chapterTitle} is out.`
      : `${label} is out.`;

  return {
    title: `${row.title} — Chapter Ping`,
    description: `${latest} Track ${row.title} and get pinged the moment the next chapter drops.`,
    url: `${origin}${path}`,
    imageUrl: seriesCoverUrl(row.external_id),
    imageAlt: `Cover of ${row.title}`,
  };
}
