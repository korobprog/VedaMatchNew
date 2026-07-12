# VedaMatch Motivation — NestJS Production Port

## Scope

Port the approved Motivation design into the production NestJS 11 / Prisma 6 / Next.js 16 monorepo without changing the existing self-identification contract. The first production release includes personalized feed, preferences, archive, favorites, public share pages, admin controls, daily idempotent generation, S3 Story assets, and RU/EN/HI text.

## Profile Mapping

- `seeker` → `user`
- `practitioner` → `in_goodness`
- `yogi` → `yogi`
- `devotee` → `devotee`

Generation produces one universal and one Vaishnava post for every profile and publication date (eight canonical posts/day). User preference controls weighted feed ordering, not generation volume.

## Task 1 — Contracts and persistence

1. Add Motivation enums and Prisma models for posts, translations, preferences, favorites, and views.
2. Add relations to `User`, feed indexes, and unique daily generation keys.
3. Create a production migration and regenerate Prisma Client.
4. Add Motivation DTO/response contracts to `@vedamatch/shared`.
5. Verify Prisma schema formatting and generation.

## Task 2 — Core API and feed

1. Add `MotivationModule` to `AppModule`.
2. Implement authenticated feed, archive, favorites, preferences, and view tracking.
3. Implement public post retrieval with localized content and source attribution.
4. Implement admin list/hide/edit/regenerate endpoints guarded by portal roles.
5. Add focused service/controller tests for authorization, weighting, pagination, and uniqueness.

## Task 3 — Generation pipeline

1. Add an OpenAI-compatible Responses API client using `MOTIVATION_AI_*` settings.
2. Keep the image controller model separate as `MOTIVATION_IMAGE_CONTROLLER_MODEL=gpt-5.5`.
3. Reject any `gpt-image-*` value in the controller model field.
4. Call the built-in `image_generation` tool and extract the returned image payload.
5. Upload versioned 9:16 assets to S3 and publish database changes transactionally.
6. Enforce verified-source rules and safe fallback content when generation fails.
7. Make daily generation idempotent through the unique generation key.

## Task 4 — Scheduling and operations

1. Add a Redis-backed durable generation queue with leases, bounded retries, and dead-letter state.
2. Add a daily scheduler and an admin manual enqueue endpoint.
3. Ensure only the API worker publishes completed canonical posts.
4. Add health/status visibility for queue and generation batches.
5. Document manual generation, recovery, and regeneration procedures.

## Task 5 — Next.js experience

1. Add authenticated `/motivation` feed with image above localized text.
2. Add balance slider, language selection, archive, favorites, and read state.
3. Add share actions and Story download.
4. Add public `/motivation/post/[slug]` with metadata, attribution, registration CTA, and Open Graph image.
5. Add admin Motivation page for hide/edit/regenerate and batch status.
6. Add component/API tests for feed interactions and public rendering.

## Task 6 — Production configuration

1. Add Redis and Motivation environment variables to Dokploy compose.
2. Keep secrets only in Dokploy environment; never commit them.
3. Confirm production startup runs `prisma migrate deploy` before the API.
4. Build API and web images locally or through the repository build commands.
5. Push `codex/motivation-production` and deploy that exact commit.

## Task 7 — Production verification

1. Confirm migration, API startup, Redis connectivity, and S3 access in logs.
2. Trigger one generation batch for a controlled publication date.
3. Verify exactly eight unique canonical posts exist.
4. Verify universal/Vaishnava feed balance, archive, favorites, and preferences.
5. Verify RU/EN/HI text and downloadable 9:16 image assets.
6. Verify public share page and VedaMatch registration CTA.
7. Verify admin hide/edit/regenerate and asset version replacement.

## Safety gates

- Do not deploy if Prisma generation, API tests/build, web tests/build, or migration validation fails.
- Do not expose provider, database, OAuth, JWT, or S3 secrets in source or logs.
- Do not replace the production branch until the deploy commit is pushed and identified.
- Stop generation and preserve existing posts if the provider or S3 health check fails.
- Rotate all secrets shared in chat after deployment.
