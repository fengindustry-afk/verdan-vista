# Verdant Vista — Technical Specification

**Project**: Esterra Carbon Credit Flow Manager — Web Edition  
**Version**: 0.1.0  
**Repository**: [carbon-tracker-main](/) — Verdant Vista web app branch  
**Status**: Active development; production-ready on RLS enforcement

---

## 1. Project Overview

**Verdant Vista** is the web port of the **Esterra Carbon Credit Flow Manager**, a carbon-tracking and CORC (Carbon Offset Removal Certificate) issuance platform. The app shares a live Supabase backend with the **.NET MAUI mobile app** (`carbon-tracker-dotnet`), using a unified document-store schema and role-based access control.

### Core Mission
- Track biochar feedstock from source to CORC issuance
- Manage custody and workflow stages for carbon credits
- Provide compliance exports (NCMP, Shariah, carbon-tax)
- Real-time field monitoring (tree health, GPS sites, CCTV cameras)
- Team collaboration with role-gated access (Viewer / Operator / Manager / Admin)

---

## 2. Technology Stack

### Frontend Framework & Build
| Component | Technology | Version | Purpose |
|-----------|-----------|---------|---------|
| **Framework** | React | 18.3.1 | UI rendering & component lifecycle |
| **Language** | TypeScript | 5.8.3 | Type-safe development |
| **Bundler** | Vite | 8.0.0 | Fast HMR dev, optimized production builds |
| **Package Manager** | npm | (latest) | Dependency management |

### UI & Styling
| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Component Library** | Radix UI (headless) | Accessible, unstyled primitives (dialog, button, menu, etc.) |
| **Shadcn/ui** | Pre-built Radix components | Ready-to-use form controls, data tables, badges |
| **Styling** | Tailwind CSS 3.4.17 | Utility-first CSS; HSL-based theming engine |
| **Icons** | Lucide React 0.462.0 | 462+ consistent SVG icons |
| **Motion** | Framer Motion 12.38.0 | Smooth entrance animations, micro-interactions |
| **Carousel** | Embla 8.6.0 | Touch-enabled image galleries |
| **Date Picker** | React Day Picker 8.10.1 | Calendar component for date selection |

### Data & State Management
| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Server State** | TanStack React Query 5.83.0 | Fetch, cache, invalidate Supabase data; automatic refetch on focus |
| **Form State** | React Hook Form 7.61.1 | Lightweight form validation & submission |
| **Validation** | Zod 3.25.76 | Runtime schema validation (TypeScript-first) |
| **Routing** | React Router 6.30.1 | Client-side SPA routing; lazy code-splitting |

### Backend & Data Layer
| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Backend** | Supabase (PostgreSQL) | Hosted PostgreSQL + Auth + Storage + Realtime |
| **Auth** | Supabase GoTrue | Email/password sign-up, sessions, JWT tokens |
| **Database** | PostgreSQL (document-store schema) | Collections store data as JSONB; queryable + indexable |
| **Storage** | Supabase Storage (S3-compatible) | Geotagged photos, tree scans, receipt images; private + signed URLs |
| **SDK** | @supabase/supabase-js 2.110.0 | Client library; handles JWT refresh, auth state, queries |

### Specialized Libraries
| Feature | Technology | Purpose |
|-----------|-----------|---------|
| **Charts** | Recharts 2.15.4 | Tree growth, CORC issuance trends, biomass plots |
| **OCR** | Tesseract.js 5.1.1 | Client-side receipt image → text extraction (7-year retention) |
| **Video Streaming** | HLS.js 1.6.16 | Live camera feeds (CCTV module) |
| **Excel Export** | XLSX (SheetJS) 0.20.3 | NCMP/Shariah/tax compliance reports |
| **PDF Export** | jsPDF + jsPDF-AutoTable 4.2.1 | Generate audit-ready PDFs |
| **Notifications** | Sonner 1.7.4 | Toast notifications (success/error/info) |
| **Toast Theme** | next-themes 0.3.0 | Light/dark toasts (legacy; app uses custom theme system) |
| **Drawers** | Vaul 0.9.9 | Mobile-friendly side sheet / drawer component |
| **Resizable Panels** | React Resizable Panels 2.1.9 | Adjustable layout (future: CCTV multi-pane) |
| **Command Menu** | cmdk 1.1.1 | Keyboard-driven command palette (accessibility) |

### Error Tracking & Monitoring
| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Error Tracking** | Sentry (@sentry/react) 10.65.0 | Real-time frontend error reporting + session replay |
| **Tracing** | @sentry/tracing 7.120.4 | Performance metrics + distributed traces |

### Development & Testing
| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Test Runner** | Vitest 4.1.0 | Unit + integration tests (Jest-compatible) |
| **Test Utilities** | @testing-library/react 16.0.0 | Render & interact with components in tests |
| **E2E Tests** | Playwright 1.57.0 | Browser automation for feature verification |
| **Linting** | ESLint 9.32.0 | Code quality & style consistency |
| **Type Checking** | TypeScript | Static type analysis (part of build) |

### Build & Deployment
| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Build Output** | Static SPA (dist/) | ~500 KB gzipped JS + CSS |
| **Vercel Config** | vercel.json | SPA rewrites (route → index.html), env vars, deploy settings |
| **Netlify Config** | netlify.toml + _redirects | SPA rewrites, form redirects |
| **CI/CD** | GitHub Actions | Typecheck → Lint → Test → Build → Deploy |
| **Security Headers** | public/_headers | CSP, HSTS, X-Frame-Options, Referrer-Policy, etc. |
| **SEO / Privacy** | public/robots.txt + meta robots | Noindex (private app); blocks search engines |

---

## 3. Architecture

### High-Level Flow
```
┌─ User Browser (React SPA) ────────────────────┐
│  ├─ AppLayout (nav + sidebar)                 │
│  ├─ Routes (Dashboard, Feedstock, etc.)       │
│  ├─ AuthProvider (session + role lookup)      │
│  ├─ ThemeProvider (Esterra/Verdant/etc.)      │
│  └─ React Query (data fetching + caching)     │
│                                                │
└─→ Login Page (email/password or demo)         │
    ├─ Supabase GoTrue (signup/signin/refresh)  │
    └─ Stores JWT in secure httpOnly cookie     │
                                                 │
┌─ Supabase Backend (PostgreSQL) ──────────────┐
│  ├─ Auth (GoTrue) — validates JWT            │
│  ├─ Tables (feedstock, trees, readings, etc.) │
│  ├─ RLS Policies (role-based row access)      │
│  └─ Storage Buckets (photos, scans, images)   │
└─────────────────────────────────────────────────
                                                 │
┌─ Cloud Services ────────────────────────────── │
│  ├─ Sentry — error tracking                   │
│  ├─ Cloudflare R2 — image storage (future)    │
│  └─ ESA API — satellite biomass data          │
└─────────────────────────────────────────────────
```

### Key Design Patterns

#### 1. **Document-Store Schema**
Every collection (feedstock, locations, trees, etc.) is a single JSONB column `data` + `id` + metadata. This allows:
- Flexible schema evolution (no rigid migrations)
- Shared schema between web + mobile (PascalCase keys in JSONB for .NET parity)
- Full-text search and computed properties via PostgreSQL

#### 2. **Role-Based Access Control (RBAC)**
- **Roles**: Viewer, Operator, Manager, Admin (hierarchical)
- **Client-side checks** (UX) — hide/show buttons based on role from auth session
- **Server-side enforcement** (security) — RLS policies reject unauthorized reads/writes, regardless of client tampering
- **Anti-escalation trigger** — self-created user rows are pinned to Viewer; only Admin can assign elevated roles

#### 3. **React Query for Server State**
- Queries auto-refetch on focus, on interval, or on manual invalidation
- Mutations trigger query invalidation (e.g., `upsert` → refetch the collection)
- Optimistic updates (set loading state before server confirms)
- Stale-while-revalidate pattern (show cached data while checking for updates)

#### 4. **Theming via CSS Variables**
- Runtime theme switching (no page reload needed)
- Four theme sets (Verdant, Esterra, Classic HUD, Violet), each Light + Dark
- Hex → HSL-triplet conversion; luminance-based text contrast for readability
- Stored in localStorage; applied early in `main.tsx` to avoid flash
- Defaults: Esterra Light (the Esterra brand's default look)

#### 5. **Authentication & Sessions**
- **Real Supabase Auth** — email/password sign-up/sign-in via `supabase.auth.signInWithPassword`
- **Demo Login** — mock role derivation (email ends in @admin → Admin) for testing offline
- **Session Persistence** — JWT in httpOnly cookie (secure, XSS-proof); falls back to localStorage for offline demo
- **Automatic Refresh** — React Query retry logic + Supabase SDK auto-refresh tokens

### Folder Structure
```
src/
├── components/
│   ├── ui/                    # Shadcn/Radix primitives (button, dialog, etc.)
│   ├── capture/               # Field capture flows (CaptureScanDialog, EditReadingDialog, etc.)
│   ├── AppLayout.tsx          # Nav + sidebar + outlet
│   ├── AppSidebar.tsx         # Navigation menu
│   ├── AuthProvider.tsx       # Auth context (session, login state)
│   ├── RequireAuth.tsx        # Route guard; redirects to login if not authenticated
│   ├── BentoCard.tsx          # Glass-morphism card container
│   ├── StoredImage.tsx        # Resolves image from bucket → signed URL → <img>
│   └── ErrorBoundary.tsx      # Catches React errors; shows fallback UI
├── pages/
│   ├── Dashboard.tsx          # CORC overview + custody grid
│   ├── Feedstock.tsx          # Batch list + detail
│   ├── Workflow.tsx           # 7-stage custody flow
│   ├── CorcCalculator.tsx     # Puro-aligned biochar calculator
│   ├── Assets.tsx             # Sites + geotagged photos + biomass
│   ├── TestingPlot.tsx        # Field-trial trees (editable)
│   ├── TreeDetail.tsx         # Tree growth chart, readings (tap-to-edit), scans (health analyzer)
│   ├── Receipts.tsx           # Receipt capture + OCR
│   ├── Users.tsx              # Team management (RBAC gated)
│   ├── Reports.tsx            # NCMP/Shariah/tax exports
│   ├── Cctv.tsx               # Live HLS camera feeds
│   ├── AuditTrail.tsx         # Immutable edit log
│   ├── Settings.tsx           # Appearance (themes) + offline mode + export
│   ├── Login.tsx              # Email/password + demo access
│   ├── Onboarding.tsx         # Optional 3-step tour
│   └── NotFound.tsx           # 404 fallback
├── lib/
│   ├── auth.tsx               # AuthProvider, useAuth hook, session restore
│   ├── supabase.ts            # Supabase client initialization
│   ├── data.ts                # Generic getCollection, upsertDocument, deleteDocument
│   ├── collections.ts         # Collection names (feedstock, trees, etc.)
│   ├── types.ts               # TypeScript interfaces (Feedstock, Tree, TreeReading, etc.)
│   ├── rbac.ts                # Role enums, permission checks, role parsing
│   ├── format.ts              # formatCurrency, formatDate, etc.
│   ├── feedstock.ts           # Biochar CORC calculations
│   ├── storage.ts             # uploadImage, resolveImageUrl, bucket names
│   ├── receiptImage.ts        # Grayscale WebP compression
│   ├── ocr.ts                 # Tesseract OCR orchestration
│   ├── health.ts              # Tree-health analyzer (ExG greenness index)
│   ├── theme.ts               # Theme system (hex→HSL, theme sets, CSS-var rewrite)
│   ├── theme-context.tsx      # ThemeProvider + useTheme hook
│   ├── sentry.ts              # Sentry initialization (prod error tracking)
│   ├── cookieStorage.ts       # Custom storage adapter (httpOnly cookies + localStorage fallback)
│   └── capture.ts             # GPS geolocation, camera access, blob utilities
├── hooks/
│   └── useCollection.ts       # useQuery wrappers for each collection; useUpsert, useDelete mutations
├── App.tsx                    # Root: QueryClientProvider → ThemeProvider → TooltipProvider → AuthProvider → Router
├── main.tsx                   # Entry point; applies saved theme before render
└── index.css                  # Global Tailwind + custom utilities (glass-card, glow-orb, shimmer, etc.)
```

---

## 4. Core Features

### Dashboard
- **CORC Issuance Overview** — live count of credits issued, by stage (sourced, processed, custody, retired)
- **Custody Grid** — real-time view of batches in each workflow stage (7-stage hub)
- **Sparklines** — rolling 30-day issuance trend

### Feedstock Management
- **Batch List** — filter by supplier, status, stage; sort by date, amount
- **Detail View** — full chain-of-custody log, CORC breakdown (carbon removal, durability class, storage risk), audit trail with immutable edit history
- **Upsert** — operators can add/edit feedstock; managers can verify and transition stages
- **Export** — NCMP / Shariah / carbon-tax compliance exports (XLSX/PDF/CSV)

### Workflow (7-Stage Hub)
- **Sourced** — feedstock received
- **Processed** — biochar produced; metrics recorded
- **Custody** — chain-of-custody tracking
- **Monitored** — long-term monitoring (tree health scans, ESA biomass fusion)
- **Retired** — credits issued to end-user
- **Compliance** — audit trail + regulatory sign-off
- **Archived** — historical records

### CORC Calculator
- **Puro-aligned** — inputs: biochar amount (tons), storage duration, soil carbon gain, durability class
- **Real-time output** — CO₂ removal estimate (t CO₂e), credit count (1 credit = 1 t CO₂e)
- **Durability tiers** — permanent (100 yr), long-term (30+ yr), durable (5+ yr)

### Assets & CCTV
- **GPS Sites** — geotagged locations with photo galleries
- **Satellite Biomass** — ESA AGBM fusion (baseline + monitoring snapshots)
- **Live Cameras** — HLS streams from on-site sensors (CCTV module uses hls.js)
- **Photo Galleries** — touch-enabled carousel, lightbox zoom, EXIF metadata

### Testing Plot (Field Trial)
- **Tree Management** — add/edit trees (species, treatment group, plot name, age, treatment date)
- **Growth Readings** — tap to edit height, canopy, stem diameter, leaf count, SPAD, flowers, fruit, yield
- **Health Scans** — capture tree images; run on-device health analysis (Excess Green Index heuristic, 0–100 vigor score; future: ML model from mobile)
- **Chart** — line graph of height + canopy over time (by treatment group)
- **Grouped View** — organize trees by treatment (Biochar A, Control, Ungrouped)

### Receipts & OCR
- **Capture** — photo or upload receipt image
- **OCR** — Tesseract.js extracts text on the client
- **Parser** — custom regex to extract date, amount, supplier, items
- **7-year Retention** — indexed for audit, searchable by date/amount
- **Image Compression** — grayscale WebP to reduce storage

### Users & RBAC
- **Team Directory** — list all authenticated users with roles
- **Self-Service Profile** — users can edit their own name, phone, email, photo
- **Admin Panel** — admins can create/update/delete users, assign roles (locked by anti-escalation trigger on DB)
- **Role Hierarchy** — Viewer < Operator < Manager < Admin

### Audit Trail
- **Immutable Log** — every insert/update/delete recorded with timestamp, user, before/after values
- **Searchable** — filter by table, date, user
- **PDF Export** — for regulatory compliance

### Settings
- **Appearance** — theme picker (Verdant, Esterra, Classic HUD, Violet) + Dark/Light toggle; persisted to localStorage
- **Offline Mode** — toggle to work from local cache only (no network requests)
- **Data Export** — CSV download of all feedstock with computed CORCs
- **Backend Status** — shows connection state (Supabase URL + anon key, or "cache mode")

### Authentication
- **Email/Password Sign-up** — create real Supabase accounts
- **Email/Password Sign-in** — JWT issued, stored in httpOnly cookie (XSS-proof)
- **Demo Login** — mock roles (admin@, operator@, viewer@); no password; uses browser storage
- **Onboarding** — optional 3-step tour on first login
- **Session Restore** — persists JWT in httpOnly cookie; falls back to localStorage for demo
- **Sign Out** — clears session + revokes refresh token

---

## 5. Security Model

### Layers

#### Client-Side (UX Boundary)
- **RBAC Checks** — `hasPermission(role, Permission.*)` hides/shows buttons based on user role
- **RequireAuth** — route guard redirects to /login if not authenticated
- **Demo Limitation** — demo login not available in production (gate with build flag)

#### Database-Tier (Security Boundary) ⚠️ **Currently Not Enforced**
- **Row-Level Security (RLS)** — PostgreSQL policies written in `security/rls.sql`, but **NOT YET APPLIED**
- **Role Resolution** — `current_app_role()` function looks up role from `users` table by JWT email
- **Policy Model**:
  - **SELECT**: any authenticated user (Viewers included) may read all collections
  - **INSERT/UPDATE**: Operator, Manager, Admin
  - **DELETE**: Manager, Admin
  - **Anon**: denied all
- **Anti-Escalation Trigger** — `enforce_user_role()` pins self-created user rows to Viewer; only Admin can assign elevated roles
- **Users Table** — fine-grained: users can edit their own row; Admins can edit anyone

#### Transport & Storage
- **HTTPS** — enforced via `Strict-Transport-Security: max-age=63072000`
- **CORS** — limited to Supabase API + CDNs (fonts, images)
- **CSP** — `default-src 'self'`; allows `script-src 'self'`, fonts from Google, images from S3/blob/data
- **httpOnly Cookies** — JWT stored in browser-inaccessible cookies (immune to XSS token theft)
- **Image Storage** — private bucket; signed URLs expire in 1 hour (not public)
- **Noindex** — `<meta name="robots" noindex>` + `robots.txt Disallow: /` + HTTP header `X-Robots-Tag` (blocks search indexing, but does NOT secure the link; login gate is the real boundary)

### Known Risks & Mitigations

| Risk | Severity | Status | Mitigation |
|------|----------|--------|-----------|
| **Anon key bundled in client** | High | Existing | Must apply RLS before production. Anon key can be rotated. |
| **RLS policies not enforced** | Critical | **Blocking** | [Apply security/rls.sql](../security/rls.sql) once both web + .NET apps are authenticated. |
| **Demo role derivation** | Medium | Existing | Gate demo login to non-production; demo users have no real account. |
| **Receipt images not encrypted** | Low | Existing | Images are private (signed URL only); consider end-to-end encryption in future. |
| **Glow-orb animations DoS** | Low | Existing | CSS animations may spike CPU on low-end devices; no mitigation (acceptable trade-off). |

---

## 6. Deployment

### Build
```bash
npm run build        # → dist/
```
Output: ~500 KB gzipped (JS + CSS + assets), ready for CDN.

### Vercel
```
1. Import repo → set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY secrets
2. Deploy → auto-builds on push to main
3. SPA rewrites in vercel.json (routes → index.html)
```

### Netlify
```
1. Connect repo → set env vars
2. Deploy → netlify.toml + _redirects handle SPA routing
```

### Environment Variables
| Variable | Required | Example |
|----------|----------|---------|
| `VITE_SUPABASE_URL` | Yes | `https://gwtxrtrnkoynxhacgidg.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | `eyJhbGc…` (52 chars) |

Without these, the app runs in **demo mode** (offline, cached data only).

### CI/CD (GitHub Actions)
`.github/workflows/ci.yml` runs on every push:
1. **Typecheck** — `tsc --noEmit`
2. **Lint** — `eslint .`
3. **Test** — `vitest run`
4. **Build** — `vite build`
5. **Deploy** — conditional on secrets (Vercel or Netlify)

---

## 7. Development Workflow

### Local Setup
```bash
git clone <repo>
cd verdant-vista-03-main
cp .env.example .env          # Fill in Supabase URL + anon key
npm install
npm run dev                   # http://localhost:8080 (HMR enabled)
```

### Scripts
| Script | Purpose |
|--------|---------|
| `npm run dev` | Start Vite dev server (HMR on port 8080) |
| `npm run build` | Production build → dist/ |
| `npm run build:dev` | Dev build (faster, unminified) |
| `npm run lint` | ESLint + Prettier checks |
| `npm run test` | Run Vitest suite once |
| `npm run test:watch` | Watch mode for TDD |
| `npm run preview` | Serve dist/ locally (test production build) |
| `npm run security:verify` | Check RLS posture (requires Supabase API key) |
| `npm run check` | Prepush checks (lint + test + typecheck) |
| `npm run backup` | Download Supabase backup to `.supabase/backup/` |
| `npm run backup:r2` | Upload backup to Cloudflare R2 |

### IDE Setup (VS Code)
- **Extensions**: ESLint, Prettier, Tailwind CSS IntelliSense, Vite
- **.vscode/settings.json**:
  ```json
  {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.codeActionsOnSave": { "source.fixAll.eslint": true },
    "[typescript]": { "editor.defaultFormatter": "esbenp.prettier-vscode" }
  }
  ```

### Git Workflow
```
git checkout -b feature/xyz
# Make changes; commit
npm run check            # Typecheck, lint, test
git push -u origin feature/xyz
# Open PR → CI runs → deploy to Vercel staging
# Review → merge → CI deploys to production
```

---

## 8. Performance & Optimization

### Code Splitting
- **Reports & CCTV** — lazy-loaded via React.lazy (only loaded when route accessed)
- **Reduces initial bundle** — main JS ~350 KB (gzipped ~100 KB)

### Image Optimization
- **Receipts** — grayscale WebP compression (halves size)
- **Scans** — stored as WebP (if supported); fallback to JPEG
- **Geotagged Photos** — thumbnail + full-res variants (future)
- **Signed URLs** — 1-hour expiry (don't share publicly)

### Caching
- **React Query** — stale-while-revalidate; refetch on focus; 60s default stale time
- **Browser Cache** — Vite inlines hashes (index.js → index-a1b2c3.js); browser caches based on hash
- **Service Workers** — not yet implemented (future: offline-first PWA)

### Database
- **Denormalized JSONB** — single `data` column avoids joins; queries are blazing fast
- **Indexes** — on common fields (id, created_at, status)
- **Full-text Search** — supported via `websearch_to_tsquery` (for future Receipts / Audit Trail)

---

## 9. Testing Strategy

### Unit Tests (Vitest)
- **Lib functions** — format.ts, feedstock.ts, health.ts, theme.ts
- **Hooks** — useCollection, useTheme
- Run: `npm run test`

### Integration Tests (Playwright)
- **End-to-end flows** — login → create feedstock → export report
- **Responsive** — test on mobile + desktop viewports
- Run: `npm run test:e2e` (future)

### Manual Testing
- **Browser DevTools** — Network tab (verify JWT + Supabase calls)
- **Staging Deploy** — Vercel preview links on every PR
- **Supabase Dashboard** — inspect audit log, verify RLS policies (once enabled)

---

## 10. Roadmap & Future Work

### Q2 2026 (Near-term)
- [ ] **Apply RLS policies** — enforce DB-tier access control (`security/rls.sql`)
- [ ] **Mobile ML health analysis** — integrate the same model as carbon-tracker-dotnet (currently using ExG heuristic preview)
- [ ] **E2E tests** — Playwright suite for critical flows
- [ ] **Service Workers** — offline-first PWA (cache assets + reads; sync writes on reconnect)

### Q3 2026 (Medium-term)
- [ ] **Real-time updates** — Supabase Realtime subscriptions (live audit trail, custody handoff notifications)
- [ ] **Advanced search** — full-text indexing + filtering (Receipts, Audit Trail)
- [ ] **Biomass satellite integration** — auto-ingest ESA AGBM snapshots + compute gain
- [ ] **Compliance reporting** — NCMP machine-readable XML, Verra VCS formats

### Q4 2026+ (Long-term)
- [ ] **Mobile web** — Responsive redesign (currently desktop-optimized)
- [ ] **Blockchain** — CORC issuance ledger (hyperledger / Codefi) for immutability
- [ ] **API** — REST or GraphQL for third-party integrations
- [ ] **Webhook notifications** — stage transitions trigger external systems (email, Slack)

---

## 11. Support & Maintenance

### Critical Issues (respond within 24h)
- Production login broken
- Data loss or corruption
- Security vulnerability (CVE, RLS breach)

### Runbooks
- **RLS Rollback** — `security/rls-rollback.sql` (reverts to open access for debugging)
- **Reset Demo Login** — clear localStorage, restart browser
- **Certificate Renewal** — handled by Vercel / Netlify (automatic)
- **Backup & Restore** — `npm run backup` → R2; restore via Supabase Dashboard

### Escalation
1. **Slack** — #carbon-tracker-web
2. **GitHub Issues** — bug reports + feature requests
3. **Supabase Support** — database outages, account issues (commercial tier has priority)

---

## 12. License & Attribution

**Project**: Esterra Carbon Credit Flow Manager  
**License**: Proprietary (Rooted in Earth, Inc.)  
**Tech Stack**: Open-source (React, Vite, Tailwind, Supabase) + commercial (Vercel, Sentry)

---

**Last Updated**: 2026-07-13  
**Maintained By**: Development Team  
**For Questions**: See security/auth-migration.md, docs/QUICK-START-OBSERVABILITY.md, or contact the team
