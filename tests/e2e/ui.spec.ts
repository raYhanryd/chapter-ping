import { expect, test } from "@playwright/test";

const me = {
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

const series = {
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

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

    if (url.pathname === "/api/me") return json(me);
    if (url.pathname === "/api/series") return json({ items: [series] });
    if (url.pathname === "/api/destinations") return json({ destinations: [] });
    return route.fulfill({ status: 404, body: "" });
  });
});

test("Escape closes the add dialog and returns focus to its trigger", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Your series" })).toBeVisible();

  const trigger = page.getByRole("button", { name: "Add series" }).first();
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Add series" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("the dashboard does not scroll sideways", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText("One Piece", { exact: true })).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
