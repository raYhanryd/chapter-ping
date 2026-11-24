// @vitest-environment jsdom
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorResponse, jsonResponse, renderApp, stubApi } from "./helpers";

const SERIES = {
  series: {
    id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    externalId: "01J76XY7E9FNDZ1DBBM6PBJPFK",
    title: "One Piece",
    coverUrl: "https://temp.compsci88.com/cover/fallback/S1.jpg",
    siteUrl: "https://weebcentral.com/series/S1/One-Piece",
    latestChapter: {
      label: "Chapter 1132",
      title: "The Sun God",
      url: "https://weebcentral.com/chapters/1132",
      publishedAt: "2026-11-20T10:00:00.000Z",
    },
  },
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("public series page", () => {
  it("shows the cover, title and latest chapter without a session", async () => {
    const fetchMock = stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/public/series/s1") return jsonResponse(SERIES);
      return undefined;
    });

    renderApp("/s/s1");

    expect(await screen.findByRole("heading", { level: 1, name: "One Piece" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Cover of One Piece" }).getAttribute("src")).toBe(
      SERIES.series.coverUrl,
    );
    expect(screen.getByText("Chapter 1132 is out.")).toBeTruthy();
    const cta = screen.getByRole("link", { name: "Continue with Discord" });
    const next = new URL(cta.getAttribute("href") ?? "", "http://localhost").searchParams.get("next");
    expect(next).toBe("/dashboard?add=01J76XY7E9FNDZ1DBBM6PBJPFK");

    // A visitor must never be asked for a session on this page.
    expect(fetchMock.calls.some((call) => call.url.pathname === "/api/me")).toBe(false);
  });

  it("explains a link that no longer resolves", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/public/series/gone") {
        return errorResponse(404, "NOT_FOUND", "That series was not found.");
      }
      return undefined;
    });

    renderApp("/s/gone");

    expect(await screen.findByRole("heading", { level: 1, name: "That series is not here" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "See how Chapter Ping works" })).toBeTruthy();
  });
});
