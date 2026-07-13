import { test, expect } from "@playwright/test";

/**
 * Smoke tests — run authenticated via the saved session (see auth.setup.ts).
 * These assert the app boots and core routes render without console errors,
 * not deep business logic. Grow them per critical flow (capture, receipts…).
 */

test.describe("app smoke", () => {
  test("dashboard loads while signed in", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");

    // Not bounced back to the login screen.
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toBeVisible();

    // No uncaught console errors on first paint (allow known-noisy sources).
    const fatal = errors.filter((e) => !/favicon|sentry|supabase/i.test(e));
    expect(fatal, `console errors:\n${fatal.join("\n")}`).toHaveLength(0);
  });

  test("can navigate to a core route", async ({ page }) => {
    await page.goto("/receipts");
    await expect(page).not.toHaveURL(/\/login/);
    await expect(page.locator("body")).toBeVisible();
  });
});
