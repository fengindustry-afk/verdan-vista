import { test, expect } from "@playwright/test";

/** Minimal authenticated smoke test. Grow per critical user flow. */
test("home page loads while signed in", async ({ page }) => {
  await page.goto("/");
  await expect(page).not.toHaveURL(/\/login/);
  await expect(page.locator("body")).toBeVisible();
});
