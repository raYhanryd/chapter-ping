// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DESTINATION,
  errorResponse,
  jsonResponse,
  ME,
  renderApp,
  SERIES_ITEM,
  stubApi,
} from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PREVIEW = {
  series: {
    externalId: "S1",
    title: "One Piece",
    siteUrl: "https://weebcentral.com/series/S1/One-Piece",
    feedUrl: "https://weebcentral.com/series/S1/rss",
    latest: {
      number: 1132,
      label: "Chapter 1132",
      title: "One Piece Chapter 1132",
      url: "https://weebcentral.com/chapters/1132",
      publishedAt: "2026-11-20T10:00:00.000Z",
    },
  },
  alreadyTracked: false,
};

function dashboard(series: unknown[] = [SERIES_ITEM], overrides: Record<string, Response> = {}) {
  return stubApi(({ method, url }) => {
    if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
    if (method === "GET" && url.pathname === "/api/series") {
      return overrides["series"] ?? jsonResponse({ items: series });
    }
    if (method === "GET" && url.pathname === "/api/destinations") return jsonResponse({ destinations: [DESTINATION] });
    if (method === "POST" && url.pathname === "/api/series/preview") return jsonResponse(PREVIEW);
    if (method === "POST" && url.pathname === "/api/series") return jsonResponse({ series: { id: "s2" } }, 201);
    return undefined;
  });
}

describe("dashboard", () => {
  it("shows the capacity line and the caller's tracked series", async () => {
    dashboard();

    renderApp("/dashboard");

    expect(await screen.findByText("One Piece")).toBeTruthy();
    expect(screen.getByText("Chapter 1132")).toBeTruthy();
    expect(screen.getByText("Main channel")).toBeTruthy();
    expect(screen.getByText(/1 of 5 series\. 3 of 100 launch spots in use\./)).toBeTruthy();
  });

  it("invites the first series when the list is empty", async () => {
    dashboard([]);

    renderApp("/dashboard");

    expect(await screen.findByText("No series yet. Add the first one from weebcentral.")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Add series" }).length).toBeGreaterThan(0);
  });

  it("shows an error with a retry action instead of a blank table", async () => {
    dashboard([], { series: errorResponse(500, "INTERNAL_ERROR", "Something went wrong.") });

    renderApp("/dashboard");

    expect(await screen.findByText("Could not load your series.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("add series", () => {
  it("checks a link, previews it, and saves it to the chosen destination", async () => {
    const user = userEvent.setup();
    const fetchMock = dashboard();

    renderApp("/dashboard");
    await screen.findByText("One Piece");

    await user.click(screen.getAllByRole("button", { name: "Add series" })[0]!);
    const dialog = await screen.findByRole("dialog", { name: "Add series" });

    await user.type(within(dialog).getByLabelText("Weebcentral link"), "https://weebcentral.com/series/S1/One-Piece");
    await user.click(within(dialog).getByRole("button", { name: "Check series" }));

    expect(await within(dialog).findByText("One Piece")).toBeTruthy();
    expect(within(dialog).getAllByText(/Chapter 1132/).length).toBeGreaterThan(0);

    await user.selectOptions(within(dialog).getByLabelText("Send alerts to"), "d1");
    await user.click(within(dialog).getByRole("button", { name: "Add series" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add series" })).toBeNull());
    expect(screen.getByText("Series added.")).toBeTruthy();

    const save = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === "/api/series" && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(save).toBeTruthy();
    expect(JSON.parse(String((save?.[1] as RequestInit).body))).toEqual({
      url: "https://weebcentral.com/series/S1/One-Piece",
      destinationId: "d1",
    });
  });
});

describe("series detail", () => {
  it("shows the schedule and the last delivery attempts for one series", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/series") return jsonResponse({ items: [SERIES_ITEM] });
      if (method === "GET" && url.pathname === "/api/activity")
        return jsonResponse({
          items: [
            {
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
            },
          ],
        });
      return undefined;
    });

    renderApp("/series/sub1");

    expect(await screen.findByRole("heading", { level: 1, name: "One Piece" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open on weebcentral" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Delivery history" })).toBeTruthy();
    expect((await screen.findAllByText("Chapter 1132")).length).toBeGreaterThan(0);
    expect(screen.getByText("Sent")).toBeTruthy();
  });
});

describe("series actions", () => {
  it("pauses a series and reflects the new state", async () => {
    const user = userEvent.setup();
    let active = true;
    const fetchMock = stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/series")
        return jsonResponse({ items: [{ ...SERIES_ITEM, active }] });
      if (method === "PATCH" && url.pathname === "/api/series/sub1") {
        active = false;
        return jsonResponse({ subscription: { id: "sub1", active: false } });
      }
      return undefined;
    });

    renderApp("/dashboard");
    await screen.findByText("One Piece");
    await user.click(screen.getByRole("button", { name: "Pause One Piece" }));

    expect(await screen.findByText("Paused")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) === "/api/series/sub1" && (init as RequestInit | undefined)?.method === "PATCH",
      ),
    ).toBe(true);
  });
});
