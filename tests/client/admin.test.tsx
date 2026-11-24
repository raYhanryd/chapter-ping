// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorResponse, jsonResponse, ME, renderApp, SERIES_ITEM, stubApi } from "./helpers";

const OWNER_DISCORD = "1245083537015570573";

const OVERVIEW = {
  stats: {
    users: 3,
    newUsers7d: 2,
    waitlist: 1,
    subscriptions: { active: 4, total: 5 },
    series: { active: 2, total: 3, withErrors: 1 },
    destinations: { active: 2, disabled: 1, total: 3 },
    chapters: 12,
    deliveries: {
      sent24h: 7,
      retry24h: 1,
      failed24h: 2,
      pending24h: 3,
      skipped24h: 0,
      sentTotal: 40,
      failedTotal: 5,
      pending: 3,
      retry: 1,
    },
    cron: { lastRunAt: new Date(Date.now() - 120_000).toISOString(), healthy: true },
  },
  users: [
    {
      id: "u1",
      name: "raYhan_ryd",
      discordId: OWNER_DISCORD,
      createdAt: "2026-11-20T10:39:01.426Z",
      lastSeenAt: new Date(Date.now() - 60_000).toISOString(),
      seriesActive: 2,
      seriesTotal: 2,
      destinations: 1,
      waitlisted: false,
    },
    {
      id: "u2",
      name: "Hyawii",
      discordId: "1082686076491137115",
      createdAt: "2026-11-23T16:56:20.136Z",
      lastSeenAt: null,
      seriesActive: 0,
      seriesTotal: 0,
      destinations: 0,
      waitlisted: true,
    },
  ],
  topSeries: [{ id: "s1", title: "One Piece", subscribers: 2 }],
  runs: [
    {
      id: "r1",
      startedAt: new Date(Date.now() - 120_000).toISOString(),
      finishedAt: new Date(Date.now() - 60_000).toISOString(),
      status: "ok",
      feedsChecked: 4,
      chaptersFound: 2,
      deliveriesSent: 2,
      errors: 0,
      detail: null,
    },
  ],
};

const OWNER_ME = { ...ME, admin: true };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("service desk", () => {
  it("shows the owner every account with its Discord id", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(OWNER_ME);
      if (method === "GET" && url.pathname === "/api/admin/overview") return jsonResponse(OVERVIEW);
      return undefined;
    });

    renderApp("/admin");

    expect(await screen.findByRole("heading", { level: 1, name: "Service desk" })).toBeTruthy();
    expect(await screen.findByText(OWNER_DISCORD)).toBeTruthy();
    expect(screen.getByText("1082686076491137115")).toBeTruthy();
    expect(screen.getByText("2 joined this week")).toBeTruthy();
    expect(screen.getByText("On the waitlist")).toBeTruthy();
    expect(screen.getByText("One Piece")).toBeTruthy();

    const primary = screen.getByRole("navigation", { name: "Primary" });
    const adminLink = within(primary).getByRole("link", { name: "Admin" });
    expect(adminLink.getAttribute("aria-current")).toBe("page");
  });

  it("tells the owner the series cap does not apply", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(OWNER_ME);
      if (method === "GET" && url.pathname === "/api/series") return jsonResponse({ items: [SERIES_ITEM] });
      return undefined;
    });

    renderApp("/dashboard");

    expect(await screen.findByText(/No cap on the owner account/)).toBeTruthy();
  });

  it("keeps the desk out of a reader's reach", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/admin/overview")
        return errorResponse(403, "FORBIDDEN", "This page belongs to the owner account.");
      return undefined;
    });

    renderApp("/admin");

    expect(await screen.findByText(/belongs to the owner account/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });
});
