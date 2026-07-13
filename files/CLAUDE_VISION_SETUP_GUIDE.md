# Esterra Receipt Pipeline — Claude Vision Edition

## What changed from the last build
Previous version used Telegram + Google Apps Script + Gemini. This one uses **Claude Vision** as you requested, running as a real Node.js server instead of Apps Script. Writes to your **single `Transactions` tab** — not monthly tabs. Do not add tab-routing logic later without talking to me first; that's the exact bug that broke your dashboard once already.

## What you need before starting

| Credential | Where to get it |
|---|---|
| `TELEGRAM_TOKEN` | @BotFather on Telegram, `/newbot` |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud Console → see below |
| `SHEET_ID` | From your Sheet's URL: `.../d/THIS_PART/edit` |

### Getting the Google Service Account (one-time setup)
Unlike the Apps Script version, this Node server needs its own Google credentials — it's not running inside your Sheet.

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project (or use an existing one)
2. Enable the **Google Sheets API** (APIs & Services → Library → search "Google Sheets API" → Enable)
3. Create a **Service Account** (APIs & Services → Credentials → Create Credentials → Service Account)
4. Open the service account → Keys → Add Key → JSON. This downloads a `.json` file — its entire contents become your `GOOGLE_SERVICE_ACCOUNT_JSON` env variable.
5. **Critical step people miss:** open your Google Sheet → Share → add the service account's email (looks like `xxx@xxx.iam.gserviceaccount.com`, found in the JSON file) as an **Editor**. Without this, every append call fails with a permissions error.

## Local test run

```bash
npm install
export TELEGRAM_TOKEN="your_token"
export ANTHROPIC_API_KEY="your_key"
export GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'   # entire JSON as one line
export SHEET_ID="your_sheet_id"
npm start
```

You'll see `Listening on 3000`. This only handles local requests — Telegram can't reach `localhost`. For real testing, either deploy (below) or use a tunnel like `ngrok http 3000` to get a temporary public URL.

## Deploy (pick one — Railway is the least friction)

**Railway** (recommended for a first deploy):
1. Push this folder to a GitHub repo
2. railway.app → New Project → Deploy from GitHub
3. Add the 4 environment variables in Railway's dashboard (Settings → Variables)
4. Railway gives you a public URL like `https://your-app.up.railway.app`

**Any other Node host** (Render, Fly.io, a VPS) works the same way — set the env vars, deploy, get a public HTTPS URL.

## Connect Telegram to your deployed server

Run this once (replace both placeholders):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_TOKEN>/setWebhook?url=<YOUR_PUBLIC_URL>/telegram-webhook"
```

Expected response: `{"ok":true,"result":true,"description":"Webhook was set"}`

## Test it
Message your bot a receipt photo. You should get a confirmation reply within a few seconds, and the row appears in your `Transactions` tab.

## Things I built in on purpose — don't strip these out

- **`validateExtraction()`** rejects anything where Claude's Ledger/Type/Category doesn't exactly match your real lists. Without this, a hallucinated category silently corrupts your SUMIFS formulas — same failure mode as the blank-Type rows I found in your April data. This is the single most important guard rail in the whole pipeline.
- **`needs_review` flag** — Claude flags its own low-confidence guesses (blurry photo, ambiguous Ledger). Check these periodically instead of trusting every auto-entry blindly.
- **Amount = 0 or missing → hard reject**, not a silent zero. A silent zero is exactly how your Income column ended up empty for an entire year without anyone noticing.

## Cost reality check
`claude-haiku-4-5` is cheap enough that per-receipt cost is a non-issue at personal/small-business volume. If you scale to hundreds of receipts a day across a team, revisit — but you're nowhere near that threshold based on what I've seen in your sheet so far.
