// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DESTINATION, jsonResponse, ME, renderApp, SERIES_ITEM, stubApi } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SEARCH_RESULT = {
  externalId: "S1",
  title: "One Piece",
  siteUrl: "https://weebcentral.com/series/S1",
  coverUrl: "https://temp.compsci88.com/cover/fallback/S1.jpg",
};

const PREVIEW = {
  series: {
    externalId: "S1",
    title: "One Piece",
    siteUrl: "https://weebcentral.com/series/S1",
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

function api(options: { destinations?: unknown[] } = {}) {
  return stubApi(({ method, url }) => {
    if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
    if (method === "GET" && url.pathname === "/api/series") return jsonResponse({ items: [SERIES_ITEM] });
    if (method === "GET" && url.pathname === "/api/destinations")
      return jsonResponse({ destinations: options.destinations ?? [DESTINATION] });
    if (method === "GET" && url.pathname === "/api/series/search")
      return jsonResponse({ items: [SEARCH_RESULT] });
    if (method === "POST" && url.pathname === "/api/series/preview") return jsonResponse(PREVIEW);
    if (method === "POST" && url.pathname === "/api/series") return jsonResponse({ series: { id: "s2" } }, 201);
    return undefined;
  });
}

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByText("One Piece");
  await user.click(screen.getAllByRole("button", { name: "Add series" })[0]!);
  return screen.findByRole("dialog", { name: "Add series" });
}

describe("series search", () => {
  it("browses the source without leaving the app and previews what you pick", async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    renderApp("/dashboard");

    const dialog = await openDialog(user);
    const result = await within(dialog).findByRole("button", { name: /One Piece/ });
    expect(within(dialog).getByAltText("")).toBeTruthy();

    await user.click(result);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([input, init]) =>
            String(input) === "/api/series/preview" &&
            (init as RequestInit | undefined)?.method === "POST" &&
            JSON.parse(String((init as RequestInit).body)).url === "https://weebcentral.com/series/S1",
        ),
      ).toBe(true),
    );
    expect(await within(dialog).findByText("Chapter 1132")).toBeTruthy();
  });

  it("sends the typed title to the search endpoint", async () => {
    const user = userEvent.setup();
    const fetchMock = api();
    renderApp("/dashboard");

    const dialog = await openDialog(user);
    await user.type(within(dialog).getByLabelText("Search weebcentral"), "blue lock");

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) => String(input).includes("/api/series/search?q=blue%20lock")),
      ).toBe(true),
    );
  });
});

describe("adding without a destination", () => {
  it("tells you to add a destination first instead of dead-ending", async () => {
    const user = userEvent.setup();
    api({ destinations: [] });
    renderApp("/dashboard");

    const dialog = await openDialog(user);

    expect(await within(dialog).findByText("Add a Discord destination first.")).toBeTruthy();
    expect(within(dialog).getByRole("link", { name: "Add a destination" })).toBeTruthy();
    expect(within(dialog).queryByLabelText("Weebcentral link")).toBeNull();
  });
});
