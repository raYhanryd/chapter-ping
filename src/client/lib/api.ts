export interface MeResponse {
  user: { id: string; name: string; image: string | null };
  createdAt: string | null;
  capacity: {
    accountsUsed: number;
    accountsMax: number;
    activeSeries: number;
    activeSeriesMax: number;
    seriesPerUser: number;
    destinationsPerUser: number;
  };
  waitlisted: boolean;
}

export interface GlobalStatus {
  acceptingUsers: boolean;
  accountsUsed: number;
  accountsMax: number;
  activeSeries: number;
  activeSeriesMax: number;
}

export interface LatestChapter {
  label: string;
  title: string | null;
  url: string | null;
  publishedAt: string | null;
}

export interface SeriesItem {
  id: string;
  seriesId: string;
  title: string;
  siteUrl: string;
  latestChapter: LatestChapter | null;
  destination: { id: string; label: string };
  active: boolean;
  nextCheckAt: string;
  lastCheckedAt: string | null;
  lastError: string | null;
}

export interface PreviewChapter {
  number: number;
  label: string;
  title: string;
  url: string;
  publishedAt: string | null;
}

export interface PreviewResponse {
  series: {
    externalId: string;
    title: string;
    siteUrl: string;
    feedUrl: string;
    latest: PreviewChapter;
  };
  alreadyTracked: boolean;
}

export interface Destination {
  id: string;
  label: string;
  status: "active" | "disabled";
  guildId: string | null;
  guildName: string | null;
  channelId: string | null;
  channelName: string | null;
  roleId: string | null;
  lastError: string | null;
  lastCheckedAt: string | null;
  inUseBy: number;
}

export interface ActivityItem {
  id: string;
  status: string;
  attempts: number;
  lastError: string | null;
  sentAt: string | null;
  createdAt: string;
  chapter: { id: string; number: number; label: string; title: string; url: string };
  series: { id: string; title: string };
  destination: { id: string; label: string };
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor?: string;
}

export interface ActivityFilters {
  status?: string;
  seriesId?: string;
  cursor?: string;
  limit?: number;
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; field?: string };
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly field?: string;
  readonly retryAfter?: number;

  constructor(message: string, details: { code: string; status: number; field?: string; retryAfter?: number }) {
    super(message);
    this.name = "ApiClientError";
    this.code = details.code;
    this.status = details.status;
    this.field = details.field;
    this.retryAfter = details.retryAfter;
  }
}

export function messageFor(cause: unknown, fallback: string): string {
  if (cause instanceof ApiClientError) {
    return cause.retryAfter
      ? `${cause.message} Try again in ${cause.retryAfter} seconds.`
      : cause.message;
  }
  return cause instanceof Error ? cause.message : fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("content-type", "application/json");

  const response = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers,
  });

  if (response.status === 204) return undefined as T;

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as ApiErrorBody | null)?.error;
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new ApiClientError(error?.message ?? "Something went wrong. Try again.", {
      code: error?.code ?? "UNKNOWN",
      status: response.status,
      field: error?.field,
      retryAfter: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    });
  }

  return body as T;
}

export const api = {
  me: () => request<MeResponse>("/api/me"),

  status: () => request<GlobalStatus>("/api/status"),

  series: () => request<{ items: SeriesItem[] }>("/api/series"),

  previewSeries: (url: string) =>
    request<PreviewResponse>("/api/series/preview", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),

  addSeries: (url: string, destinationId: string) =>
    request<{ series: { id: string } }>("/api/series", {
      method: "POST",
      body: JSON.stringify({ url, destinationId }),
    }),

  updateSeries: (id: string, active: boolean) =>
    request<{ subscription: { id: string; active: boolean } }>(`/api/series/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ active }),
    }),

  removeSeries: (id: string) =>
    request<void>(`/api/series/${encodeURIComponent(id)}`, { method: "DELETE" }),

  destinations: () => request<{ destinations: Destination[] }>("/api/destinations"),

  addDestination: (input: { label: string; webhookUrl: string; roleId: string }) =>
    request<{ destination: Destination }>("/api/destinations", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  updateDestination: (id: string, input: { label?: string; webhookUrl?: string; roleId?: string }) =>
    request<{ destination: Destination }>(`/api/destinations/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),

  removeDestination: (id: string) =>
    request<void>(`/api/destinations/${encodeURIComponent(id)}`, { method: "DELETE" }),

  testDestination: (id: string) =>
    request<{ ok: true }>(`/api/destinations/${encodeURIComponent(id)}/test`, { method: "POST" }),

  activity: (filters: ActivityFilters = {}) => {
    const search = new URLSearchParams();
    if (filters.status) search.set("status", filters.status);
    if (filters.seriesId) search.set("seriesId", filters.seriesId);
    if (filters.cursor) search.set("cursor", filters.cursor);
    if (filters.limit) search.set("limit", String(filters.limit));
    const query = search.toString();
    return request<ActivityPage>(`/api/activity${query ? `?${query}` : ""}`);
  },

  deleteAccount: (confirm: string) =>
    request<void>("/api/account/delete", {
      method: "POST",
      body: JSON.stringify({ confirm }),
    }),

  signIn: async (callbackURL?: string) => {
    const body = await request<{ url?: string }>("/api/auth/sign-in/social", {
      method: "POST",
      body: JSON.stringify({ provider: "discord", ...(callbackURL ? { callbackURL } : {}) }),
    });
    if (!body.url) {
      throw new ApiClientError("Discord sign-in could not start. Try again.", {
        code: "SIGN_IN_FAILED",
        status: 502,
      });
    }
    return body.url;
  },

  signOut: () =>
    request<unknown>("/api/auth/sign-out", {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
