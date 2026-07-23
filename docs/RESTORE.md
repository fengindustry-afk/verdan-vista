# Restore from Backup

Backups are gzipped JSON snapshots of every Verdant Vista table, produced by
`scripts/backup-supabase.mjs`. Sources, newest first:

1. **R2**: bucket → `verdant-vista/backup-<timestamp>.json.gz`
2. **GitHub Actions**: repo → Actions → Database Backup → run → `database-backups` artifact (30-day retention)
3. **Local**: `backups/` (last 7)

Snapshot shape:

```json
{ "project": "verdant-vista", "exportedAt": "...", "tables": { "trees": [ {row}, ... ], ... } }
```

## Restore a single table (typical case: bad edit, accidental delete)

For row-level mistakes, prefer the in-app Audit Trail restore first — it keeps
the edit_history intact. Use a backup only when data is gone from the DB.

Run in Node with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` set:

```bash
node -e "
const zlib = require('zlib'), fs = require('fs');
const snap = JSON.parse(zlib.gunzipSync(fs.readFileSync(process.argv[1])));
const table = process.argv[2];
const rows = snap.tables[table];
fetch(process.env.SUPABASE_URL + '/rest/v1/' + table, {
  method: 'POST',
  headers: {
    apikey: process.env.SUPABASE_SERVICE_KEY,
    Authorization: 'Bearer ' + process.env.SUPABASE_SERVICE_KEY,
    'Content-Type': 'application/json',
    Prefer: 'resolution=merge-duplicates'
  },
  body: JSON.stringify(rows)
}).then(r => r.text().then(t => console.log(r.status, t || 'restored ' + rows.length + ' rows')));
" backups/backup-XXXX.json.gz trees
```

`resolution=merge-duplicates` upserts by primary key: existing rows are
overwritten with backup values, rows created after the backup are left alone.

## Full restore (all tables)

Repeat the above per table, or loop over `Object.keys(snap.tables)`. Restore
`edit_history` last so restored rows don't interleave oddly with new audit
entries.

## Verify after restoring

Open the app and spot-check the affected module, then check the Audit Trail
still loads. Backups do NOT include Supabase Auth users or Storage files —
auth is Supabase-managed, media lives in R2 (see docs/R2-STORAGE.md).

## Test the pipeline

Run the workflow manually (Actions → Database Backup → Run workflow), download
the artifact, gunzip it, and confirm row counts look sane. Do this after any
schema change that adds a table — and add the table to `TABLES` in
`scripts/backup-supabase.mjs`.
