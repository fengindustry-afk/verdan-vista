# Playwright starter template

A copy-paste E2E setup that works the same across all your projects. Drop these
files into a repo, tweak two values, and you have browser tests + CI.

## What's here

```
playwright.config.ts     # standalone config: webServer, auth setup, 3 browsers
e2e/
  auth.setup.ts          # logs in ONCE, saves session to e2e/.auth/user.json
  smoke.spec.ts          # example authenticated smoke tests
.github/workflows/e2e.yml
```

## Install (per project)

```bash
npm i -D @playwright/test
npx playwright install --with-deps   # first time only
```

Add to `package.json`:

```json
"scripts": {
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --ui",
  "test:e2e:headed": "playwright test --headed",
  "test:e2e:report": "playwright show-report"
}
```

Add to `.gitignore`:

```
/test-results/
/playwright-report/
/blob-report/
/playwright/.cache/
/e2e/.auth/
```

## The only two things you MUST change

1. **Port + dev command** in `playwright.config.ts`:
   - `const PORT = 8080` → your dev server port (Vite 5173, CRA 3000, Next 3000…)
   - `webServer.command` → `npm run dev` / `npm start` / `pnpm dev` as appropriate

2. **Login flow** in `e2e/auth.setup.ts` — point the selectors at your real
   sign-in form, or delete the file (and the `setup` project + `storageState`
   references in the config) if the app has no auth.

## Run

```bash
npm run test:e2e          # headless, all browsers
npm run test:e2e:ui       # interactive watch/debug mode (best for writing tests)
npm run test:e2e -- --project=chromium   # one browser, fast
```

`webServer` starts the dev server automatically — you don't need it already
running. Locally it reuses an existing server; in CI it always starts fresh.

## Auth: one login, reused everywhere

`auth.setup.ts` runs as a dependency of every browser project. It logs in once,
saves the browser session to `e2e/.auth/user.json`, and specs load it via
`storageState` so they start authenticated. This is faster and less flaky than
logging in inside each test.

- Real credentials → set `E2E_EMAIL` / `E2E_PASSWORD` env vars (repo secrets in CI).
- Never commit `e2e/.auth/` — it holds live session tokens.

## Standardizing across many repos

- **Shared base config:** publish `@yourname/playwright-config` exporting a
  `defineConfig` base; each repo does `export default { ...base, webServer }`.
- **Template repo:** keep this folder in a `templates` repo and copy it in, or
  wrap it in a small `create-*` scaffold script.
- Keep the CI workflow identical everywhere so reports and artifacts line up.
