import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

/**
 * Authenticate once and persist the session for all specs.
 *
 * This app exposes password-free demo logins (Admin/Operator/Viewer) in dev
 * mode, which set a local session under localStorage["ct_user"]. That is enough
 * for smoke-testing the authenticated UI without real Supabase credentials.
 *
 * To test against REAL Supabase Auth instead, set E2E_EMAIL / E2E_PASSWORD and
 * flip USE_REAL_AUTH — the email/password branch below fills the sign-in form.
 */
const USE_REAL_AUTH = Boolean(process.env.E2E_EMAIL && process.env.E2E_PASSWORD);

setup("authenticate", async ({ page }) => {
  await page.goto("/login");

  // Dismiss the optional first-visit tour dialog if it appears.
  const maybeLater = page.getByRole("button", { name: /maybe later/i });
  if (await maybeLater.isVisible().catch(() => false)) {
    await maybeLater.click();
  }

  if (USE_REAL_AUTH) {
    await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL!);
    await page.getByLabel(/password/i).fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: /^sign in$/i }).click();
  } else {
    // Demo path — the "Admin" quick-access button.
    await page.getByRole("button", { name: /^admin$/i }).click();
  }

  // Landed on the dashboard (route "/", away from /login).
  await expect(page).toHaveURL(/\/(?!login).*/);
  await page.context().storageState({ path: authFile });
});
