import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { AppRoutes } from "../../src/client/App";

if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
}

export interface ApiCall {
  method: string;
  url: URL;
  body: unknown;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function errorResponse(status: number, code: string, message: string, field?: string): Response {
  return jsonResponse({ error: { code, message, ...(field ? { field } : {}) } }, status);
}

export function stubApi(
  handler: (call: ApiCall) => Response | Promise<Response> | undefined,
): ReturnType<typeof vi.fn> {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost");
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const call = { method: init?.method ?? "GET", url, body };
    calls.push(call);
    const response = await handler(call);
    if (!response) throw new Error(`Unhandled API call: ${call.method} ${url.pathname}${url.search}`);
    return response;
  });
  Object.assign(fetchMock, { calls });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <div
      data-testid="location"
      data-pathname={location.pathname}
      data-next={new URLSearchParams(location.search).get("next") ?? ""}
    />
  );
}

export function renderApp(route = "/"): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const ui: ReactElement = (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <LocationProbe />
        <AppRoutes />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return render(ui);
}

export const ME = {
  user: { id: "u1", name: "Ray Reader", image: null },
  createdAt: "2026-11-01T10:00:00.000Z",
  capacity: {
    accountsUsed: 3,
    accountsMax: 100,
    activeSeries: 7,
    activeSeriesMax: 150,
    seriesPerUser: 5,
    destinationsPerUser: 2,
  },
  waitlisted: false,
};

export const STATUS = {
  acceptingUsers: true,
  accountsUsed: 3,
  accountsMax: 100,
  activeSeries: 7,
  activeSeriesMax: 150,
};

export const SERIES_ITEM = {
  id: "sub1",
  seriesId: "s1",
  title: "One Piece",
  siteUrl: "https://weebcentral.com/series/S1/One-Piece",
  latestChapter: {
    label: "Chapter 1132",
    title: "One Piece Chapter 1132",
    url: "https://weebcentral.com/chapters/1132",
    publishedAt: "2026-11-20T10:00:00.000Z",
  },
  destination: { id: "d1", label: "Main channel" },
  active: true,
  nextCheckAt: "2026-11-20T12:30:00.000Z",
  lastCheckedAt: "2026-11-20T11:55:00.000Z",
  lastError: null,
};

export const DESTINATION = {
  id: "d1",
  label: "Main channel",
  status: "active",
  guildId: "323456789012345678",
  guildName: null,
  channelId: "223456789012345678",
  channelName: null,
  roleId: "123456789012345678",
  lastError: null,
  lastCheckedAt: "2026-11-20T11:55:00.000Z",
  inUseBy: 1,
};

export const ACTIVITY_ITEM = {
  id: "a1",
  status: "sent",
  attempts: 1,
  lastError: null,
  sentAt: "2026-11-20T11:00:00.000Z",
  createdAt: "2026-11-20T10:59:00.000Z",
  chapter: {
    id: "c1",
    number: 1132,
    label: "Chapter 1132",
    title: "One Piece Chapter 1132",
    url: "https://weebcentral.com/chapters/1132",
  },
  series: { id: "s1", title: "One Piece" },
  destination: { id: "d1", label: "Main channel" },
};
