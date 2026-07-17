# Cloudflare R2 media offload

Heavy files (receipt images/PDFs, geotagged photos, tree scans) go to a single
Cloudflare R2 bucket instead of Supabase Storage — R2 is ~$0.015/GB/month with
**zero egress fees**, so 50GB of receipts costs about $1/month and the Supabase
DB stays lean.

## How it works

```
browser ──POST /functions/v1/r2-sign──▶ edge function (holds R2 keys)
   ◀── short-lived presigned URL ──┘
browser ──PUT/GET directly──▶ R2 bucket        (bytes never touch Supabase)
```

- `src/lib/storage.ts` tries **R2 → Supabase Storage → inline base64**, in that
  order, so nothing breaks while R2 is unconfigured or the user is offline.
- Rows store the reference `r2:<bucket>/<key>` (e.g. `r2:receipts/rcpt_x.webp`);
  legacy Supabase paths and base64 rows keep working unchanged — no migration
  required to turn this on.
- Uploads require Operator/Manager/Admin (checked via the same
  `current_app_role()` the RLS uses); reads require any signed-in user.

## One-time setup

### 1. Create the bucket
Cloudflare dashboard → **R2 Object Storage** → Create bucket → name it
`esterra-media` (or set a different name in the `R2_BUCKET` secret).

### 2. Create a scoped API token
R2 → **Manage R2 API Tokens** → Create API token:
- Permission: **Object Read & Write**
- Scope: only the `esterra-media` bucket
- Note the **Access Key ID**, **Secret Access Key**, and your **Account ID**
  (shown on the R2 overview page).

### 3. Set the bucket CORS policy
Bucket → **Settings → CORS policy** — required or the browser's direct
PUT/GET is blocked:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:8080",
      "http://localhost:8090",
      "https://YOUR-PRODUCTION-DOMAIN"
    ],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

### 4. Set the Supabase secrets & deploy

```
npx supabase secrets set R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... --project-ref gwtxrtrnkoynxhacgidg
npx supabase functions deploy r2-sign --project-ref gwtxrtrnkoynxhacgidg
```

(`R2_BUCKET` is optional; defaults to `esterra-media`.)

### 5. Verify
Sign in with a real account, scan & save a receipt, then check:
- the browser console has **no** `[storage] R2 upload … unavailable` warning,
- the object appears in the R2 bucket under `receipts/`,
- the receipt row's `ImageUrl` starts with `r2:` and the thumbnail renders.

## Notes

- Presigned PUT URLs live 15 minutes, GET URLs 60 minutes (cached client-side
  for 55). After a signing failure the client skips R2 for 5 minutes to avoid
  hammering a missing/misconfigured function.
- Existing images stay in Supabase Storage; they can be migrated later by
  copying objects to R2 and rewriting the row references to `r2:receipts/<key>`
  — worth doing only if Supabase storage pressure actually materialises.
- If the planned Oracle VM migration happens, `r2-sign` is a ~100-line Deno
  handler with no Supabase-specific logic beyond auth — easy to re-home.
