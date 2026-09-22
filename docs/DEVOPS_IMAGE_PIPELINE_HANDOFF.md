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
# API (unchanged) — keep IMAGE_WORKER_ENABLED=false on this process
pm2 start ecosystem.config.js
# Worker — autostart is false; enable explicitly after IAM + flags
IMAGE_WORKER_ENABLED=true IMAGE_PROCESSING_ENABLED=true pm2 start ecosystem.config.js --only cureka-image-worker
# or after a rebuild
IMAGE_WORKER_ENABLED=true IMAGE_PROCESSING_ENABLED=true npm run start:image-worker
# if dist/apps/api/image-worker.js is missing (stale dist)
IMAGE_WORKER_ENABLED=true IMAGE_PROCESSING_ENABLED=true npm run start:image-worker:dev
```

Scripts:

- `npm run start:image-worker` → `node dist/apps/api/image-worker.js` (requires `npm run build`)
- `npm run start:image-worker:dev` → ts-node `apps/api/image-worker.ts`
- `npm run image:backfill` / `npm run image:retry` — dry-run by default. Apply needs a **one-shot prefix**, not an API env change:

```bash
IMAGE_PROCESSING_ENABLED=true npm run image:backfill -- --apply --entity-types=banners --sample-limit=5 --batch-size=5
```

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
2. Derivatives remain in the private bucket; clients use stable `/api/v1/public/media/{key}` for merchandising (signed URLs only for private folders). **Do not make the bucket public.**
3. Object metadata for new derivatives: `contentType=image/webp`, `cacheControl=public, max-age=31536000, immutable`. The media proxy also sets this on the HTTP response.
4. Masters keep GCS `Cache-Control: private, max-age=0`. The proxy/CDN sets `public, max-age=86400` when streaming them.
5. No lifecycle delete of `derivatives/` in this change.
6. Billing: extra object count + egress; monitor GCS class A/B ops.

CDN in front of GCS is **not** required. Cache the **proxy** paths instead:

- `GET /api/v1/public/media/*` (API origin and/or storefront proxy)
- After storefront ships `/media/*`, cache that as public static too
- `/_next/image*` should cache on `url + w + q + Accept` (today `cf-cache-status: DYNAMIC` despite Next `max-age=2592000`)

Do **not** solve cache misses by making `cureka-files-prod` world-readable.

## Redis

Same Redis as other BullMQ queues. Consider:

- Queue isolation if `image-pipeline` depth competes with checkout jobs
- `removeOnComplete` / `removeOnFail` caps (config defaults 100 / 200)
- Do not run unbounded backfill against a tiny Redis

## Env rollout

Homepage LCP on production **requires** (API + worker, not only docs):

```
IMAGE_DELIVERY_ENABLED=true
IMAGE_PROCESSING_ENABLED=true
IMAGE_WORKER_ENABLED=true   # worker process only; API cluster stays false
PUBLIC_MEDIA_STABLE_URLS=true
STOREFRONT_URL=https://www.cureka.com
```

If delivery is on but processing/worker are off, every homepage `imageDelivery` stays `pending` with empty `variants`.

Staging enable order: migration → worker process → `IMAGE_PROCESSING_ENABLED=true` → sample backfill (`--keys=` for the live hero, then `--priority=homepage`) → `IMAGE_DELIVERY_ENABLED=true` → frontend.

Catch-up (does not overwrite masters):

```bash
IMAGE_PROCESSING_ENABLED=true npm run image:backfill -- --apply --keys=banners/068fa179-05ff-4848-a3a8-6988d3fbd4fe.png
IMAGE_PROCESSING_ENABLED=true npm run image:backfill -- --apply --priority=homepage --batch-size=25 --rate-limit-ms=200
```

Verify `GET /api/v1/public/homepage/sections`: hero `imageDelivery.status` is `ready` or `partial`, `variants` includes width **800** WebP, `url` is `/api/v1/public/media/...` (identical across two anonymous requests 10s apart).

Signed URL TTL: prefer `GCS_SIGNED_URL_TTL_SECONDS=86400` for remaining private-folder signatures (Joi default is 3600; storage.config fallback is 86400 — **align these**).

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
2. `PUBLIC_MEDIA_STABLE_URLS=false` if the media proxy must be disabled (returns rotating signed URLs again)
3. `pm2 stop cureka-image-worker`
4. `IMAGE_PROCESSING_ENABLED=false`
5. Keep originals; do not revert the additive migration to roll back code
6. Do **not** make the GCS bucket public as a rollback

## Blockers / unverified

- GCS IAM not applied in this change
- Production worker not started
- Production backfill not run
- No transform CDN on the account (if one exists outside the repo, it was not wired)
- Next.js optimizer 504 not re-tested
- Real photographic quality vs solid-color unit-test fixtures must be checked in staging
- Redis capacity under backfill load not measured
