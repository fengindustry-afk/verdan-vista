# CarbonTracker — Web

[![CI](https://github.com/fengindustry-afk/verdan-vista/actions/workflows/ci.yml/badge.svg)](https://github.com/fengindustry-afk/verdan-vista/actions/workflows/ci.yml)

Carbon Credit Flow Manager. Vite + React + TypeScript web app, wired to the same
Supabase backend as the .NET MAUI mobile/desktop app (shared document-store schema).

## Features

- **Dashboard** — live CORC issuance overview and custody-stage credit visibility
- **Feedstock** — batch list + detail with full chain-of-custody, audit trail, and CORC breakdown
- **Workflow** — the seven-stage biomass-to-carbon-sink lifecycle
- **CORC Calculator** — Puro-aligned biochar CO₂-removal estimator
- **Assets / CCTV** — GPS sites, geotagged photos, ESA biomass fusion, and live HLS camera monitoring
- **Testing Plot** — biochar field-trial tree health and growth readings
- **Users** — role-based access control (Viewer / Operator / Manager / Admin)
- **Reports** — NCMP, Shariah, and carbon-tax compliance exports (XLSX / PDF / CSV)
- **Auth** — Supabase email/password with demo access; RBAC-gated write actions

## Local development

```sh
npm install
cp .env.example .env   # then fill in your Supabase URL + anon key
npm run dev            # http://localhost:8080
```

## Environment variables

| Variable                  | Description                                  |
| ------------------------- | -------------------------------------------- |
| `VITE_SUPABASE_URL`       | Supabase project URL                         |
| `VITE_SUPABASE_ANON_KEY`  | Supabase anon public key                     |

Without these, the app runs in demo/cache-only mode.

## Deployment

The app is a client-side-routed SPA and ships with configs for both hosts:

- **Vercel** — `vercel.json` (build + SPA rewrites). Import the repo, set the two
  env vars in Project Settings, deploy.
- **Netlify** — `netlify.toml` + `public/_redirects`. Connect the repo, set the
  two env vars, deploy.

`npm run build` outputs static assets to `dist/`.

## Continuous integration

`.github/workflows/ci.yml` runs on every push and pull request to `main`:
typecheck → lint → test (Vitest) → build.

Two deploy options run on green pushes to `main` — configure secrets for whichever
host you use; each skips cleanly when its token is unset:

- **Vercel** — the `deploy` job in `ci.yml`
- **Netlify** — `.github/workflows/deploy-netlify.yml`

Optional repo secrets (Settings → Secrets → Actions):

| Secret                     | Purpose                                         |
| -------------------------- | ----------------------------------------------- |
| `VITE_SUPABASE_URL`        | Build against the real backend (else demo mode) |
| `VITE_SUPABASE_ANON_KEY`   | Build against the real backend                  |
| `VERCEL_TOKEN`             | Enables the Vercel deploy (skips if unset)      |
| `VERCEL_ORG_ID`            | Vercel org id (`vercel link` → `.vercel/project.json`) |
| `VERCEL_PROJECT_ID`        | Vercel project id                               |
| `NETLIFY_AUTH_TOKEN`       | Enables the Netlify deploy (skips if unset)     |
| `NETLIFY_SITE_ID`          | Netlify site id                                 |

### Before going public

1. **Enable Row-Level Security** on the Supabase tables — the anon key is bundled
   into the client build.
2. **Auth email confirmation** is required by default, so real sign-ins only work
   after users confirm their email. Disable confirmation or configure SMTP in the
   Supabase Auth settings. (Demo access works regardless.)
