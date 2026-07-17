# Stack Enhancements — Cloud & Industry Roadmap

Purpose: CarbonTracker Web is already the most industry-complete project in the
portfolio (CI/e2e/security pipelines, threat model, ADR, RLS, OCR microservice,
Sentry). The upgrades below close the remaining gaps and swap self-hosted
pieces for named cloud services where it strengthens the story. Two tracks.

## Free tier / FOSS track

- **Ship it first:** push the repo public, fix the README badge (`OWNER/REPO`
  placeholder), and deploy live on Vercel/Netlify free tier with Supabase RLS
  applied (runbook already in `security/auth-migration.md`). A live URL +
  green CI badges is worth more than any new feature.
- **OCR service:** move off the "VirtualBox VM you turn on" — containerize
  `ocr-service/` (Dockerfile) and run it on an Oracle Cloud Always Free ARM VM
  or Fly.io, behind the existing `/ocr` contract. Resume line: "containerized
  Python microservice deployed to a cloud VM".
- **Backups:** `backup:r2` script already targets Cloudflare R2 (S3-compatible
  API) — schedule it in `backup.yml` if not already, and document restore
  drills (RTO/RPO), mirroring the RawSEC recovery story.
- **Sensor ingestion:** keep the HMAC mock-stream design (ADR-001); add a
  small load test (k6, FOSS) against `/api/ingest/sensor` to quote a
  throughput number in interviews.
- **Observability:** Sentry free tier (wired); add UptimeRobot (free) on the
  live URL and Lighthouse CI in GitHub Actions for performance budgets.
- **Migrations:** consolidate `security/*.sql` into Supabase CLI migrations
  for a reproducible schema.

## Paid tier track

- **Evidence retention (best real fit):** Puro.earth rule 9.3.4 requires
  records kept ≥2 years past the crediting period — store MRV evidence
  (geotagged photos, sensor archives, receipts) in AWS S3 with **Object Lock
  (WORM) + Glacier lifecycle**. Azure: immutable Blob storage. This turns a
  compliance clause into an architecture decision — strong interview material.
- **IoT ingestion at scale:** replace the single HMAC endpoint with AWS IoT
  Core (device certs, MQTT) → Kinesis/SQS → Postgres or Timestream for the
  1-minute telemetry stream. Azure: IoT Hub + Event Hubs. ADR-001's "zero
  schema change" constraint makes this a drop-in swap — say exactly that.
- **OCR upgrade:** AWS Textract AnalyzeExpense or Azure Document Intelligence
  behind the same `/ocr` response shape; keep PaddleOCR as the FOSS fallback.
- **Time-series:** TimescaleDB (on RDS/self-managed) or Amazon Timestream for
  sensor data as volume grows.
- **Edge/delivery:** CloudFront + WAF in front of the SPA; ACM-managed TLS.
- **Secrets:** move CI deploy secrets and the ingest HMAC key to AWS Secrets
  Manager / Azure Key Vault with rotation.
- **Monitoring:** Sentry paid (release health), Datadog or Grafana Cloud for
  the OCR service and ingest path.

## Resume framing

This is the flagship project — it demonstrates the full engineering lifecycle:
spec + ADR, threat model, RLS/RBAC, five CI/CD pipelines (build, e2e, security
scanning, backup, deploy), a polyglot microservice, and observability. The free
track makes it publicly verifiable; the paid track adds the enterprise nouns
(IoT Core, Kinesis, S3 Object Lock, Textract) for interview discussion.
