# Quick Start: Observability & Backup (5 min setup)

Complete these steps to enable error tracking, backups, and auth protection.

---

## ✅ Phase 1: Sentry Error Tracking (5 min)

1. **Create Sentry project**
   ```
   Go to: https://sentry.io/signup
   Select "React" → Copy DSN
   ```

2. **Add to .env**
   ```bash
   VITE_SENTRY_DSN=<paste-your-dsn-here>
   ```

3. **Deploy**
   ```bash
   npm run build
   vercel deploy
   ```

✓ Done! Errors now tracked in real-time.

---

## ✅ Phase 2: Database Backups (10 min)

### GitHub Actions (Full backups, recommended)

1. **Get Supabase Service Key**
   - Supabase Dashboard → Project Settings → API
   - Copy "Service Role Secret"

2. **Add GitHub Secrets**
   - Go to: GitHub → Settings → Secrets and variables → Actions
   - Add secret `SUPABASE_SERVICE_KEY` with the key from step 1
   - Add secret `VITE_SUPABASE_URL` with your Supabase URL

3. **(Optional) R2 for cloud backups**
   - Create Cloudflare account (free)
   - Create R2 bucket
   - Add GitHub Secrets:
     - `CLOUDFLARE_ACCOUNT_ID`
     - `CLOUDFLARE_API_TOKEN`
     - `CLOUDFLARE_BUCKET_NAME`

4. **Deploy**
   ```bash
   git add .github/workflows/backup.yml
   git commit -m "Add automated database backups"
   git push
   ```

✓ Done! Backups now run daily at 2 AM UTC.

### OR Vercel Cron (Lightweight, no external runners)

1. **Add SUPABASE_SERVICE_KEY to Vercel**
   - Vercel Dashboard → Settings → Environment Variables
   - Add `SUPABASE_SERVICE_KEY`

2. **Deploy**
   ```bash
   vercel deploy
   ```

✓ Done! Metadata backups run daily via Vercel cron.

---

## ✅ Phase 3: Supabase Auth Rate Limiting (2 min)

1. **Open Supabase Dashboard**
   - Project Settings → Authentication → Security

2. **Enable rate limiting**
   - Set: "Max login attempts" = 5 per 60s
   - Save

3. **(Recommended) Enable email verification**
   - Authentication → Email
   - Set "Confirm email" = ON
   - Save

✓ Done! Login now protected from brute-force.

---

## 🎯 Verification

- **Sentry**: Deploy app → DevTools: `throw new Error("test")` → Check Sentry dashboard
- **Backups**: GitHub Actions → Actions tab → Run backup workflow manually
- **Rate Limiting**: Try login >5 times in 60s → Should see rate limit message

---

## 📋 What Gets Backed Up?

```
✓ All tables (assets, feedstock, work_process_entries, etc.)
✓ All user data (encrypted passwords stored separately)
✓ Audit trail (edit_history)
✓ File metadata (not actual images — use S3/R2 for those)
```

## 🛡️ Security Notes

- Service keys are secrets — never commit them
- Backups are encrypted at rest (R2)
- Rate limiting prevents 10,000s of login attempts
- Sentry errors exclude sensitive data (offline errors filtered)

---

## ❓ Need Help?

See `docs/SETUP-OBSERVABILITY.md` for detailed configuration and troubleshooting.
