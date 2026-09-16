# DevOps image pipeline handoff

Repository code is implemented. **External infrastructure has not been configured** by this change. Do not treat this file as proof that GCS IAM, PM2 workers, or CDNs are live.

## Architecture to operate

- API cluster (`cureka-backend`): enqueue + serialize only. `IMAGE_WORKER_ENABLED` must stay `false` here.
- Optional process (`cureka-image-worker`): sharp encode + GCS/local writes. Fork mode, **1 instance**.
- Queue name: `image-pipeline` (BullMQ on existing Redis)
- Objects: same bucket as originals; prefix `derivatives/{pipelineVersion}/{sourceSha256}/w{width}.webp`

## Commands

```bash
npm run build
npm run migration:run
# API (unchanged)
pm2 start ecosystem.config.js
# Worker — autostart is false; enable explicitly after IAM + flags
IMAGE_WORKER_ENABLED=true IMAGE_PROCESSING_ENABLED=true pm2 start ecosystem.config.js --only cureka-image-worker
# or
IMAGE_WORKER_ENABLED=true IMAGE_PROCESSING_ENABLED=true node dist/apps/api/image-worker.js
```

Scripts:

- `npm run start:image-worker` → `node dist/apps/api/image-worker.js`
- `npm run image:backfill` / `npm run image:retry`

Worker does **not** bind HTTP. It still needs `DATABASE_URL`, Redis, `JWT_SECRET` (Joi schema), and storage env.

## Resource assumptions (unverified on prod hardware)

| Item | Suggestion to validate |
|------|------------------------|
| Instances | 1 fork process (not cluster) |
| Concurrency | `IMAGE_WORKER_CONCURRENCY=1` (this is per process) |
| Memory | `max_memory_restart: 1536M` in `ecosystem.config.js`; sharp + 15 MiB buffers |
| CPU | 1 vCPU dedicated preferred; do not co-locate on checkout API instances if they contend |
| Region | Same region as GCS bucket to cut egress/latency |
| Disk (local driver) | `UPLOAD_DIR/derivatives/**` |

## GCS / IAM (required for `STORAGE_DRIVER=gcs`)

Unverified until DevOps applies them:

1. Worker service account: `storage.objects.get` / `create` / `delete`? **get + create** on the existing private bucket. Do **not** make the bucket public.
2. Derivatives must remain private; clients use v4 signed URLs like originals.
3. Object metadata for derivatives: `contentType=image/webp`, `cacheControl=private, max-age=31536000, immutable`.
4. No lifecycle delete of `derivatives/` in this change.
5. Billing: extra object count + egress; monitor GCS class A/B ops.

CDN in front of GCS is **optional and not implemented**. If added later, cache keys must include the full signed query (or a proven auth-aware design). Do not strip signatures to raise hit rate.

## Redis

Same Redis as other BullMQ queues. Consider:

- Queue isolation if `image-pipeline` depth competes with checkout jobs
- `removeOnComplete` / `removeOnFail` caps (config defaults 100 / 200)
- Do not run unbounded backfill against a tiny Redis

## Env rollout

Production-safe defaults (current behavior):

```
IMAGE_DELIVERY_ENABLED=false
IMAGE_PROCESSING_ENABLED=false
IMAGE_WORKER_ENABLED=false
```

Staging enable order: migration → worker process → `IMAGE_PROCESSING_ENABLED=true` → sample backfill → `IMAGE_DELIVERY_ENABLED=true` → frontend.

Signed URL TTL: prefer `GCS_SIGNED_URL_TTL_SECONDS=86400` (Joi default is 3600; storage.config fallback is 86400 — **align these**). Must exceed API cache + ISR stale + tab lifetime + skew.

## Monitoring

Worker/Pino logs (no signed query strings):

- `Image derivatives published` — `sourceBytes`, dimensions, `variantBytes`, `durationMs`, `status`
- `Image process job failed`
- `Image process job enqueue failed; pending row retained for reconcile`

Reconcile repeat job every `IMAGE_RECONCILE_INTERVAL_MS` (default 5 minutes) re-queues stale `pending`/`processing` older than 10 minutes.

Add (externally): queue depth `image-pipeline`, worker RSS/CPU, GCS 403 rate, fallback rate (frontend). CDN cache-hit ratio is N/A until a CDN exists.

## Cost controls

- Keep worker concurrency at 1 until measured
- Homepage-first backfill (`--priority=homepage`, `--batch-size`, `--rate-limit-ms`)
- No catalog enqueue on API boot
- Skip SVG/animated/private folders by design

## Rollback

1. `IMAGE_DELIVERY_ENABLED=false` (or stop serving new fields)
2. `pm2 stop cureka-image-worker`
3. `IMAGE_PROCESSING_ENABLED=false`
4. Keep originals; do not revert the additive migration to roll back code

## Blockers / unverified

- GCS IAM not applied in this change
- Production worker not started
- Production backfill not run
- No transform CDN on the account (if one exists outside the repo, it was not wired)
- Next.js optimizer 504 not re-tested
- Real photographic quality vs solid-color unit-test fixtures must be checked in staging
- Redis capacity under backfill load not measured
