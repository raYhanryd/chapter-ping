const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function parse(value: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/** Short, human relative times: "in 30 min", "5 min ago", then calendar dates. */
export function formatRelative(value: string | null, now = Date.now()): string {
  const time = parse(value);
  if (time === null) return "—";

  const diff = time - now;
  const distance = Math.abs(diff);
  if (distance < 60_000) return "just now";

  const minutes = Math.round(distance / 60_000);
  if (minutes < 60) return diff > 0 ? `in ${minutes} min` : `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return diff > 0 ? `in ${hours} hr` : `${hours} hr ago`;

  const days = Math.round(hours / 24);
  if (days < 7) {
    const unit = days === 1 ? "day" : "days";
    return diff > 0 ? `in ${days} ${unit}` : `${days} ${unit} ago`;
  }

  return dateFormatter.format(new Date(time));
}

export function formatDateTime(value: string | null): string {
  const time = parse(value);
  return time === null ? "—" : dateTimeFormatter.format(new Date(time));
}

export function formatDate(value: string | null): string {
  const time = parse(value);
  return time === null ? "—" : dateFormatter.format(new Date(time));
}
