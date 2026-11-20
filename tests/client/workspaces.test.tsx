// @vitest-environment jsdom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACTIVITY_ITEM,
  DESTINATION,
  errorResponse,
  jsonResponse,
  ME,
  renderApp,
  STATUS,
  stubApi,
} from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DISABLED = {
  ...DESTINATION,
  status: "disabled",
  lastError: "Discord rejected this webhook.",
  webhookUrl: "https://discord.com/api/webhooks/123/SECRET",
};

describe("destinations", () => {
  it("shows a disabled webhook without ever rendering its URL", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/destinations") return jsonResponse({ destinations: [DISABLED] });
      return undefined;
    });

    renderApp("/destinations");

    expect(await screen.findByText("Main channel")).toBeTruthy();
    expect(screen.getByText("This webhook is disabled.")).toBeTruthy();
    expect(screen.getAllByText(/Discord rejected this webhook/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain("SECRET");
    expect(document.body.textContent).not.toContain("discord.com/api/webhooks");
  });

  it("sends a test message and reports the result", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/destinations") return jsonResponse({ destinations: [DESTINATION] });
      if (method === "POST" && url.pathname === "/api/destinations/d1/test") return jsonResponse({ ok: true });
      return undefined;
    });

    renderApp("/destinations");
    await screen.findByText("Main channel");
    await user.click(screen.getByRole("button", { name: "Send test to Main channel" }));

    expect(await screen.findByText("Test message sent.")).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) =>
          String(input) === "/api/destinations/d1/test" &&
          (init as RequestInit | undefined)?.method === "POST",
      ),
    ).toBe(true);
  });

  it("shows the wait when a test message is rate limited", async () => {
    const user = userEvent.setup();
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/destinations") return jsonResponse({ destinations: [DESTINATION] });
      if (method === "POST" && url.pathname === "/api/destinations/d1/test")
        return new Response(
          JSON.stringify({ error: { code: "RATE_LIMITED", message: "Too many test messages. Try again later." } }),
          { status: 429, headers: { "content-type": "application/json", "retry-after": "42" } },
        );
      return undefined;
    });

    renderApp("/destinations");
    await screen.findByText("Main channel");
    await user.click(screen.getByRole("button", { name: "Send test to Main channel" }));

    expect(await screen.findByText(/Try again in 42 seconds/)).toBeTruthy();
  });

  it("keeps the remove dialog open with the series names when the destination is in use", async () => {
    const user = userEvent.setup();
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/destinations") return jsonResponse({ destinations: [DESTINATION] });
      if (method === "DELETE" && url.pathname === "/api/destinations/d1")
        return errorResponse(409, "DESTINATION_IN_USE", "Reassign these series first: One Piece.");
      return undefined;
    });

    renderApp("/destinations");
    await screen.findByText("Main channel");
    await user.click(screen.getByRole("button", { name: "Remove destination Main channel" }));

    const dialog = await screen.findByRole("dialog", { name: "Remove destination?" });
    await user.click(within(dialog).getByRole("button", { name: "Remove" }));

    expect(await within(dialog).findByText("Reassign these series first: One Piece.")).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Remove destination?" })).toBeTruthy();
  });

  it("saves a new destination through the add dialog", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/destinations") return jsonResponse({ destinations: [] });
      if (method === "POST" && url.pathname === "/api/destinations") return jsonResponse({ destination: DESTINATION }, 201);
      return undefined;
    });

    renderApp("/destinations");
    await screen.findByText("No destinations yet. Add the webhook for the channel where alerts should land.");
    await user.click(screen.getByRole("button", { name: "Add destination" }));

    const dialog = await screen.findByRole("dialog", { name: "Add destination" });
    await user.type(within(dialog).getByLabelText("Label"), "Main channel");
    await user.type(
      within(dialog).getByLabelText("Webhook URL"),
      "https://discord.com/api/webhooks/123456789012345678/token_abc",
    );
    await user.type(within(dialog).getByLabelText("Role ID (optional)"), "<@&123456789012345678>");
    await user.click(within(dialog).getByRole("button", { name: "Save destination" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add destination" })).toBeNull());
    expect(screen.getByText("Destination saved.")).toBeTruthy();
    const save = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === "/api/destinations" && (init as RequestInit | undefined)?.method === "POST",
    );
    expect(JSON.parse(String((save?.[1] as RequestInit).body))).toEqual({
      label: "Main channel",
      webhookUrl: "https://discord.com/api/webhooks/123456789012345678/token_abc",
      roleId: "123456789012345678",
    });
  });

  it("updates a replacement destination without requiring a new webhook", async () => {
    const user = userEvent.setup();
    const fetchMock = stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/destinations") return jsonResponse({ destinations: [DESTINATION] });
      if (method === "PATCH" && url.pathname === "/api/destinations/d1")
        return jsonResponse({ destination: { ...DESTINATION, label: "Renamed" } });
      return undefined;
    });

    renderApp("/destinations");
    await screen.findByText("Main channel");
    await user.click(screen.getByRole("button", { name: "Replace webhook for Main channel" }));

    const dialog = await screen.findByRole("dialog", { name: "Replace webhook" });
    await user.clear(within(dialog).getByLabelText("Label"));
    await user.type(within(dialog).getByLabelText("Label"), "Renamed");
    await user.click(within(dialog).getByRole("button", { name: "Save destination" }));

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Replace webhook" })).toBeNull());
    const save = fetchMock.mock.calls.find(
      ([input, init]) =>
        String(input) === "/api/destinations/d1" && (init as RequestInit | undefined)?.method === "PATCH",
    );
    expect(JSON.parse(String((save?.[1] as RequestInit).body))).toEqual({
      label: "Renamed",
      roleId: "123456789012345678",
    });
  });
});

describe("activity", () => {
  it("honours the status filter in the URL and appends the next page", async () => {
    const user = userEvent.setup();
    const second = {
      ...ACTIVITY_ITEM,
      id: "a2",
      chapter: { ...ACTIVITY_ITEM.chapter, id: "c2", number: 1131, label: "Chapter 1131" },
    };
    const fetchMock = stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/activity") {
        if (url.searchParams.get("cursor")) return jsonResponse({ items: [second] });
        return jsonResponse({ items: [ACTIVITY_ITEM], nextCursor: "2026-11-20T11:00:00.000Z|a1" });
      }
      return undefined;
    });

    renderApp("/activity?status=sent");

    expect(await screen.findByText("Chapter 1132")).toBeTruthy();
    expect((screen.getByLabelText("Show status") as HTMLSelectElement).value).toBe("sent");

    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByText("Chapter 1131")).toBeTruthy();

    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input), "http://localhost");
        return url.pathname === "/api/activity" && url.searchParams.get("status") === "sent";
      }),
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const url = new URL(String(input), "http://localhost");
        return url.pathname === "/api/activity" && url.searchParams.get("cursor") === "2026-11-20T11:00:00.000Z|a1";
      }),
    ).toBe(true);
  });
});

describe("settings", () => {
  it("requires the typed confirmation before deleting the account", async () => {
    const user = userEvent.setup();
    let deleted = false;
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me")
        return deleted ? errorResponse(401, "UNAUTHORIZED", "Sign in.") : jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/status") return jsonResponse(STATUS);
      if (method === "POST" && url.pathname === "/api/account/delete") {
        deleted = true;
        return new Response(null, { status: 204 });
      }
      return undefined;
    });

    renderApp("/settings");

    expect(await screen.findAllByText("Ray Reader")).toBeTruthy();
    expect(await screen.findByText(/3 of 100 launch spots in use/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Delete account" }));
    const dialog = await screen.findByRole("dialog", { name: "Delete account?" });
    const confirm = within(dialog).getByRole("button", { name: "Delete account and data" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await user.type(within(dialog).getByLabelText("Type DELETE to confirm"), "DELETE");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    await user.click(confirm);

    expect(await screen.findByRole("heading", { level: 1, name: "Chapter alerts that land in Discord" })).toBeTruthy();
  });
});

describe("signed-in waitlist", () => {
  it("tells a waitlisted member where they stand", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse({ ...ME, waitlisted: true });
      if (method === "GET" && url.pathname === "/api/status")
        return jsonResponse({ acceptingUsers: false, accountsUsed: 100, accountsMax: 100, activeSeries: 150, activeSeriesMax: 150 });
      return undefined;
    });

    renderApp("/waitlist");

    expect(await screen.findByText(/You're on the waitlist/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to your series" }).getAttribute("href")).toBe("/dashboard");
  });
});
