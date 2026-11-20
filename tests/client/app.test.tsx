// @vitest-environment jsdom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { errorResponse, jsonResponse, ME, renderApp, STATUS, stubApi } from "./helpers";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("landing and login", () => {
  it("shows the editorial pitch with real capacity numbers", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return errorResponse(401, "UNAUTHORIZED", "Sign in.");
      if (method === "GET" && url.pathname === "/api/status") return jsonResponse(STATUS);
      return undefined;
    });

    renderApp("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Chapter alerts that land in Discord" })).toBeTruthy();
    expect(await screen.findByText(/3 of 100 launch spots in use/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login");
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeTruthy();
    expect(screen.getByText("Example alert")).toBeTruthy();
  });

  it("does not leave the capacity line spinning when status fails", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return errorResponse(401, "UNAUTHORIZED", "Sign in.");
      if (method === "GET" && url.pathname === "/api/status") return errorResponse(503, "SERVICE_UNAVAILABLE", "Down.");
      return undefined;
    });

    renderApp("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Chapter alerts that land in Discord" })).toBeTruthy();
    expect(await screen.findByText("Capacity is unavailable right now.")).toBeTruthy();
  });

  it("sends a signed-in visitor to the dashboard", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/series") return jsonResponse({ items: [] });
      return undefined;
    });

    renderApp("/");

    expect(await screen.findByRole("heading", { level: 1, name: "Your series" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Destinations" }).length).toBeGreaterThan(0);
  });

  it("sends a signed-out app route to login", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return errorResponse(401, "UNAUTHORIZED", "Sign in.");
      return undefined;
    });

    renderApp("/settings");

    expect(await screen.findByRole("heading", { name: "Sign in with Discord" })).toBeTruthy();
  });

  it("sends a 401 from a data query to login with the current path", async () => {
    let expired = false;
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me")
        return expired ? errorResponse(401, "UNAUTHORIZED", "Session expired.") : jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/series") {
        expired = true;
        return errorResponse(401, "UNAUTHORIZED", "Session expired.");
      }
      return undefined;
    });

    renderApp("/dashboard");

    expect(await screen.findByRole("heading", { name: "Sign in with Discord" })).toBeTruthy();
    const location = screen.getByTestId("location");
    expect(location.dataset.pathname).toBe("/login");
    expect(location.dataset.next).toBe("/dashboard");
  });

  it("shows a generic login error without echoing the provider detail", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return errorResponse(401, "UNAUTHORIZED", "Sign in.");
      return undefined;
    });

    renderApp("/login?error=access_denied&error_description=super-secret-detail");

    expect(await screen.findByRole("heading", { name: "Sign in with Discord" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Discord sign-in did not finish");
    expect(document.body.textContent).not.toContain("super-secret-detail");
  });

  it("explains the capped waitlist with real counts", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return errorResponse(401, "UNAUTHORIZED", "Sign in.");
      if (method === "GET" && url.pathname === "/api/status")
        return jsonResponse({ acceptingUsers: false, accountsUsed: 100, accountsMax: 100, activeSeries: 150, activeSeriesMax: 150 });
      return undefined;
    });

    renderApp("/waitlist");

    expect(await screen.findByRole("heading", { level: 1, name: "Launch capacity is full" })).toBeTruthy();
    expect(screen.getByText(/100 of 100 launch spots in use/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Continue with Discord" }).getAttribute("href")).toBe("/login");
  });
});

describe("app shell", () => {
  it("renders the rail and the mobile nav with the current section marked", async () => {
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me") return jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/series") return jsonResponse({ items: [] });
      return undefined;
    });

    renderApp("/dashboard");

    const primary = await screen.findByRole("navigation", { name: "Primary" });
    expect(within(primary).getByRole("link", { name: "Series" }).getAttribute("aria-current")).toBe("page");
    expect(within(primary).getByRole("link", { name: "Destinations" })).toBeTruthy();
    expect(within(primary).getByRole("link", { name: "Activity" })).toBeTruthy();
    expect(within(primary).getByRole("link", { name: "Settings" })).toBeTruthy();

    const mobile = screen.getByRole("navigation", { name: "Mobile" });
    expect(within(mobile).getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  it("signs out from the account menu", async () => {
    const user = userEvent.setup();
    let signedOut = false;
    stubApi(({ method, url }) => {
      if (method === "GET" && url.pathname === "/api/me")
        return signedOut ? errorResponse(401, "UNAUTHORIZED", "Sign in.") : jsonResponse(ME);
      if (method === "GET" && url.pathname === "/api/series") return jsonResponse({ items: [] });
      if (method === "GET" && url.pathname === "/api/status") return jsonResponse(STATUS);
      if (method === "POST" && url.pathname === "/api/auth/sign-out") {
        signedOut = true;
        return jsonResponse({ success: true });
      }
      return undefined;
    });

    renderApp("/dashboard");
    await screen.findByRole("heading", { level: 1, name: "Your series" });
    await user.click(screen.getByRole("button", { name: /Ray Reader/ }));
    await user.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByRole("heading", { level: 1, name: "Chapter alerts that land in Discord" })).toBeTruthy();
  });
});
