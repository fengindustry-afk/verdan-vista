# Observability & Backup Setup

This document covers setup for:
1. **Sentry** — Error tracking and performance monitoring
2. **Automated Database Backups** — Scheduled exports to R2 or local storage
3. **Supabase Auth Rate Limiting** — Brute-force protection for login

---

## 1. Sentry Error Tracking (Frontend)

Sentry captures unhandled errors, React crashes, and performance metrics to alert you of production issues.

### Setup Steps

1. **Create a Sentry project**
   - Visit https://sentry.io and sign up (free tier available)
   - Create a new project: Select "React"
   - Copy your DSN (looks like `https://xxxxx@xxxxxx.ingest.sentry.io/xxxxxx`)

2. **Add DSN to environment**
   ```bash
   # .env or .env.production
   VITE_SENTRY_DSN=https://xxxxx@xxxxxx.ingest.sentry.io/xxxxxx
   ```

3. **Build and deploy**
   ```bash
   npm run build
   # Deploy to Vercel
   vercel deploy
   ```

4. **Verify integration**
   - Deploy the app and trigger an error (DevTools console: `throw new Error("test")`)
   - Check Sentry dashboard for the error

### Configuration

The Sentry SDK is initialized in `src/lib/sentry.ts`:
- **Sample rate**: 10% of transactions in production, 100% in development
- **Filtering**: Offline network errors are filtered out (expected behavior)
- **Stack traces**: Captured automatically
- **Environment**: Set to Vite `MODE` (development/production)

### What Gets Tracked

- ✅ Unhandled JavaScript errors
- ✅ React component errors (via ErrorBoundary)
- ✅ Network request failures
- ✅ Performance metrics (page load, API latency)
- ✅ User session information

### What's Filtered

- ❌ Offline network errors (navigator.onLine = false)
- ❌ Expected browser API errors

---

## 2. Automated Database Backups

Verdant Vista uses Supabase free tier, which has no automatic backups. We provide two backup strategies:

### Option A: GitHub Actions + Supabase CLI (Recommended)

Automatically dumps the entire database daily.

**Setup:**

1. **Generate Supabase service key**
   - Go to Supabase Dashboard → Project Settings → API
   - Under "Service Role Secret", copy the key
   - Add to GitHub Secrets: `SUPABASE_SERVICE_KEY`

2. **Add required secrets to GitHub**
   - `SUPABASE_SERVICE_KEY` — from step above
   - `VITE_SUPABASE_URL` — your Supabase URL (already public)

3. **(Optional) Configure R2 for cloud storage**
   - Get Cloudflare Account ID and API Token
   - Create an R2 bucket (free tier: 10GB/month)
   - Add these GitHub Secrets:
     - `CLOUDFLARE_ACCOUNT_ID`
     - `CLOUDFLARE_API_TOKEN`
     - `CLOUDFLARE_BUCKET_NAME`

4. **Workflow runs automatically**
   - Every day at 2 AM UTC
   - Triggers on push (if you add `on: [push]`)
   - Backup artifacts retained for 30 days
   - Files stored in `backups/` and uploaded to R2 if configured

**To run manually:**
```bash
# Local machine (requires Supabase CLI)
supabase db dump --db-url "postgresql://postgres:YOUR_PASSWORD@YOUR_HOST:5432/postgres" > backup.sql

# Or via script (requires pg_dump + SERVICE_KEY in env)
node scripts/backup-supabase.mjs --to-r2
```

### Option B: Vercel Cron Function

Lightweight cron job running on Vercel (no external runners needed).

**Setup:**

1. **Configure environment variables**
   - `SUPABASE_SERVICE_KEY` → in Vercel Settings
   - `CLOUDFLARE_*` → optional, for R2 upload

2. **Deploy**
   ```bash
   vercel deploy
   ```

3. **Cron runs automatically**
   - Every day at 2 AM UTC (configured in `vercel.json`)
   - Uses `/api/crons/backup` endpoint
   - Creates minimal metadata dump

**Limitations:**
- Function timeout: 10 seconds (Vercel Hobby)
- Cannot run full pg_dump (too slow)
- Good for lightweight metadata/audit logs

---

## 3. Supabase Auth Rate Limiting

Protects login endpoint from brute-force attacks.

### Setup Steps

1. **Open Supabase Dashboard**
   - Project Settings → Authentication → Security

2. **Enable rate limiting**
   - Navigate to "Auth Rate Limiting"
   - Set login attempts: **5 per 60 seconds** (configurable)
   - Or use default recommended values

3. **Alternative: Email confirmation**
   - Authentication → Email → Set "Confirm email" = ON
   - Users must verify email before first login
   - Reduces brute-force success rate

4. **Monitor failed login attempts**
   - AuditTrail page logs failed auth events
   - Check `/audit-trail` after suspicious activity

### Configuration Options

| Setting | Value | Notes |
|---------|-------|-------|
| Max login attempts | 5-10 | Per 60s window |
| Lockout duration | Auto-release | No permanent locks |
| Email verification | ON | Recommended |
| MFA (if paid) | Enable | Extra security |

### Testing Rate Limits

```javascript
// DevTools console: attempt login > 5 times in 60s
// Should see: "Too many login attempts. Please try again later."
```

---

## Monitoring & Alerts

### Sentry Dashboard
- View errors in real-time: https://sentry.io/organizations/YOUR-ORG
- Set up alerts for critical issues (email, Slack)
- Resolve issues once fixed

### Backup Status
- GitHub Actions: Check workflow history (Actions tab)
- Vercel Cron: Check Function logs (Vercel Dashboard)
- R2: Monitor bucket size in Cloudflare dashboard

### Auth Security
- Supabase Dashboard → Authentication → Logs
- AuditTrail page (`/audit-trail`) shows failed login attempts
- Search by email to see user's login history

---

## Troubleshooting

### Sentry not capturing errors
- Verify `VITE_SENTRY_DSN` is set in `.env`
- Check browser console for initialization errors
- Ensure React ErrorBoundary is in place (`src/components/ErrorBoundary.tsx`)

### Backup script fails
- **Missing pg_dump**: Install postgres client (`brew install postgresql` or `apt install postgresql`)
- **Missing SERVICE_KEY**: Set `SUPABASE_SERVICE_KEY` in GitHub Secrets
- **Timeout on Vercel**: Use GitHub Actions for full dumps (Vercel has 10s limit)

### Rate limiting not working
- Verify in Supabase Dashboard → Authentication → Security
- Clear browser cookies and retry
- Check AuditTrail for login events

---

## Cost Estimates

| Service | Free Tier | Cost/mo |
|---------|-----------|---------|
| Sentry | 5k events/mo | $29+ for 50k |
| Cloudflare R2 | First 10 GB free | $0.015/GB after |
| Supabase | Rate limiting included | — |
| GitHub Actions | 2,000 min/mo free | $0.008/min after |
| Vercel Cron | Included | — |

**Recommendation**: Start with GitHub Actions + R2. Move to Vercel cron only if GitHub Actions quota is exhausted.

---

## References

- [Sentry React Docs](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Supabase CLI Backup](https://supabase.com/docs/guides/cli/local-development#exporting-data)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Vercel Cron Functions](https://vercel.com/docs/crons)
