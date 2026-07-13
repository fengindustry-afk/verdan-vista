import { test as setup, expect } from "@playwright/test";

// Relative to the project root (works in both ESM and CommonJS projects).
const authFile = "e2e/.auth/user.json";

/**
 * Log in ONCE and persist the session for every spec.
 * Point the selectors below at your app's real sign-in form.
 */
setup("authenticate", async ({ page }) => {
  await page.goto("/login");

  await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL ?? "test@example.com");
  await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD ?? "password");
  await page.getByRole("button", { name: /sign in|log in/i }).click();

  // Assert you left the login page (adjust to a real post-login marker).
  await expect(page).toHaveURL(/\/(?!login).*/);

  await page.context().storageState({ path: authFile });
});
