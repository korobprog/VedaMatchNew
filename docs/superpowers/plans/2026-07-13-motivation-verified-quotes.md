# VedaMatch Motivation Verified Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Построить двухэтапный процесс публикации проверенных дословных цитат, где изображение создаётся только после одобрения текста администратором.

**Architecture:** Каталог цитат отделяется от опубликованных постов и хранит оригинал, источник, проверку, профили и переводы. Discovery-worker сначала использует Vedabase в PostgreSQL, затем разрешённые внешние адаптеры; moderation service управляет переходами статусов, а существующий image-worker обрабатывает только `image_queued` по одному заданию.

**Tech Stack:** NestJS 11, Prisma 6/PostgreSQL, Next.js, React, Jest, Testing Library, Responses API `image_generation`, существующий Vedabase search index.

## Global Constraints

- Ежедневно создаются ровно восемь новых кандидатов.
- Оригинальная цитата всегда хранится отдельно и не изменяется ИИ.
- Внешний поиск работает только по белому списку доменов.
- Переводы ИИ маркируются `Перевод VedaMatch`.
- Профили назначаются автоматически: `user`, `yogi`, `in_goodness`, `devotee`.
- `devotee` получает вайшнавские и универсальные материалы; остальные профили — универсальные.
- Image API не вызывается до одобрения текста.
- Публикация требует отдельного одобрения изображения.
- Одновременно выполняется не более одного image job.
- Изображение вертикальное, без текста и логотипов.

---

## File Map

- `apps/api/prisma/schema.prisma` — каталог цитат, источники, назначения профилей, moderation state и audit.
- `apps/api/src/modules/motivation/quote-normalizer.ts` — стабильный отпечаток цитаты.
- `apps/api/src/modules/motivation/quote-source-policy.ts` — белый список и правила источников.
- `apps/api/src/modules/motivation/quote-discovery.service.ts` — поиск восьми кандидатов.
- `apps/api/src/modules/motivation/quote-verification.service.ts` — дословная проверка и атрибуция.
- `apps/api/src/modules/motivation/motivation-copy.service.ts` — классификация, объяснение и переводы.
- `apps/api/src/modules/motivation/motivation-moderation.service.ts` — переходы text/image review.
- `apps/api/src/modules/motivation/motivation-image-director.ts` — выбор стиля и prompt.
- `apps/api/src/modules/motivation/motivation-worker.service.ts` — последовательная обработка только одобренных image jobs.
- `packages/shared/src/motivation.ts` — DTO и команды админки.
- `apps/web/src/components/motivation/motivation-admin-controls.tsx` — две очереди модерации.

### Task 1: Схема каталога и moderation state

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_motivation_verified_quotes/migration.sql`
- Modify: `packages/shared/src/motivation.ts`
- Test: `apps/api/src/modules/motivation/motivation.service.spec.ts`

**Interfaces:**
- Produces: `MotivationQuote`, `MotivationQuoteTranslation`, `MotivationQuoteProfile`, `MotivationModerationAudit`.
- Produces: `MotivationReviewStatus`, `MotivationVisualStyle`, `MotivationAdminCandidateDto`.

- [ ] **Step 1: Write the failing DTO and service mapping tests**

```ts
expect(candidate).toMatchObject({
  reviewStatus: 'text_review',
  quote: { originalText: 'Exact quote', sourceType: 'vedamatch_library', verified: true },
  profileTypes: ['devotee'],
  visualStyle: null,
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --filter @vedamatch/api test -- --runInBand motivation.service.spec.ts`

Expected: FAIL because verified-quote fields do not exist.

- [ ] **Step 3: Add Prisma models and enums**

```prisma
enum MotivationReviewStatus { discovered source_verified text_review image_queued image_review published rejected failed }
enum MotivationQuoteSourceType { vedamatch_library approved_web }
enum MotivationTranslationKind { official vedamatch }
enum MotivationVisualStyle { spiritual_watercolor cinematic_nature indian_miniature sacred_architecture minimal_symbolism warm_documentary cosmic_contemplation historical_editorial }

model MotivationQuote {
  id              String   @id @default(uuid())
  originalText    String
  normalizedHash  String   @unique
  originalLanguage String  @db.VarChar(8)
  author          String
  work            String
  locator         String
  sourceType      MotivationQuoteSourceType
  sourceUrl       String?
  vedabaseBookSlug String?
  vedabaseChapterSlug String?
  contextExcerpt  String
  verified        Boolean  @default(false)
  verifiedAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  translations    MotivationQuoteTranslation[]
  profiles        MotivationQuoteProfile[]
  posts           MotivationPost[]
}
```

Add nullable `quoteId`, required `reviewStatus`, nullable `visualStyle`, `imagePrompt`, `textApprovedAt`, `imageApprovedAt`, and relations to `MotivationPost`. Add an audit model with `postId`, `actorId`, `action`, `reason`, `metadata`, and `createdAt`.

- [ ] **Step 4: Generate and inspect migration**

Run: `pnpm --filter @vedamatch/api prisma migrate dev --name motivation_verified_quotes`

Expected: migration creates new tables, enums, foreign keys and indexes without dropping existing Motivation data.

- [ ] **Step 5: Extend shared DTOs and make focused test pass**

```ts
export type MotivationReviewStatus = 'discovered' | 'source_verified' | 'text_review' | 'image_queued' | 'image_review' | 'published' | 'rejected' | 'failed';
export type MotivationVisualStyle = 'spiritual_watercolor' | 'cinematic_nature' | 'indian_miniature' | 'sacred_architecture' | 'minimal_symbolism' | 'warm_documentary' | 'cosmic_contemplation' | 'historical_editorial';
```

Run: `pnpm --filter @vedamatch/api test -- --runInBand motivation.service.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma packages/shared/src/motivation.ts apps/api/src/modules/motivation/motivation.service.spec.ts
git commit -m "feat(motivation): add verified quote catalog schema"
```

### Task 2: Нормализация, дедупликация и белый список

**Files:**
- Create: `apps/api/src/modules/motivation/quote-normalizer.ts`
- Create: `apps/api/src/modules/motivation/quote-normalizer.spec.ts`
- Create: `apps/api/src/modules/motivation/quote-source-policy.ts`
- Create: `apps/api/src/modules/motivation/quote-source-policy.spec.ts`

**Interfaces:**
- Produces: `normalizeQuote(text: string): string`.
- Produces: `quoteFingerprint(text: string): string`.
- Produces: `assertApprovedSource(url: string): URL`.

- [ ] **Step 1: Write failing normalization and source tests**

```ts
expect(quoteFingerprint('Служение — это любовь.')).toBe(quoteFingerprint(' служение - это любовь '));
expect(() => assertApprovedSource('https://unknown.example/quote')).toThrow('Source domain is not approved');
expect(assertApprovedSource('https://vedabase.io/en/library/bg/2/47/').hostname).toBe('vedabase.io');
```

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @vedamatch/api test -- --runInBand quote-normalizer.spec.ts quote-source-policy.spec.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: Implement deterministic normalization and SHA-256**

```ts
export function normalizeQuote(text: string) {
  return text.normalize('NFKC').toLocaleLowerCase('ru-RU').replace(/[—–]/g, '-').replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, ' ').trim();
}
export function quoteFingerprint(text: string) {
  return createHash('sha256').update(normalizeQuote(text)).digest('hex');
}
```

- [ ] **Step 4: Implement exact hostname policy**

Use `MOTIVATION_APPROVED_SOURCE_DOMAINS` with defaults `vedabase.io,vedabase.com,prabhupadabooks.com,wikiquote.org`. Match exact hostname or a subdomain boundary; reject redirects to unapproved hosts.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vedamatch/api test -- --runInBand quote-normalizer.spec.ts quote-source-policy.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/motivation/quote-normalizer* apps/api/src/modules/motivation/quote-source-policy*
git commit -m "feat(motivation): validate quote identity and sources"
```

### Task 3: Поиск и дословная проверка во внутренней библиотеке

**Files:**
- Modify: `apps/api/src/modules/vedabase/vedabase-content.repository.ts`
- Create: `apps/api/src/modules/motivation/quote-verification.service.ts`
- Create: `apps/api/src/modules/motivation/quote-verification.service.spec.ts`
- Modify: `apps/api/src/modules/motivation/motivation.module.ts`

**Interfaces:**
- Consumes: `normalizeQuote`, `quoteFingerprint`.
- Produces: `findQuoteCandidates(query: string, limit: number): Promise<VerifiedQuoteCandidate[]>`.
- Produces: `verifyVedabaseCandidate(candidate): Promise<VerifiedQuote>`.

- [ ] **Step 1: Write failing repository and verifier tests**

```ts
expect(await service.verifyVedabaseCandidate({ bookSlug: 'bg', chapterSlug: '2', originalText: exact })).toMatchObject({
  verified: true,
  sourceType: 'vedamatch_library',
  contextExcerpt: expect.stringContaining(exact),
});
await expect(service.verifyVedabaseCandidate({ ...candidate, originalText: 'invented' })).rejects.toThrow('Quote not found verbatim');
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @vedamatch/api test -- --runInBand quote-verification.service.spec.ts`

- [ ] **Step 3: Add a repository query returning complete search-unit attribution**

Return `bookSlug`, book title/author, `chapterSlug`, locator, unit title and full text. Do not expose raw SQL outside the repository.

- [ ] **Step 4: Implement exact normalized substring verification**

Reject candidates unless `normalizeQuote(searchUnit.text).includes(normalizeQuote(candidate.originalText))`. Create a bounded context excerpt of at most 1,000 characters around the match.

- [ ] **Step 5: Run test and API build**

Run: `pnpm --filter @vedamatch/api test -- --runInBand quote-verification.service.spec.ts && pnpm --filter @vedamatch/api build`

Expected: PASS and build exit `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/vedabase/vedabase-content.repository.ts apps/api/src/modules/motivation
git commit -m "feat(motivation): verify quotes against VedaMatch books"
```

### Task 4: Внешние source adapters и discovery восьми кандидатов

**Files:**
- Create: `apps/api/src/modules/motivation/approved-web-source.service.ts`
- Create: `apps/api/src/modules/motivation/approved-web-source.service.spec.ts`
- Create: `apps/api/src/modules/motivation/quote-discovery.service.ts`
- Create: `apps/api/src/modules/motivation/quote-discovery.service.spec.ts`
- Modify: `apps/api/src/modules/motivation/motivation-worker.service.ts`

**Interfaces:**
- Consumes: source policy and verifier.
- Produces: `ApprovedWebSearchProvider.search(query: string, limit: number): Promise<WebQuoteCandidate[]>`.
- Produces: `discoverDaily(date: Date, count = 8): Promise<MotivationQuote[]>`.

- [ ] **Step 1: Write failing priority, whitelist and exact-count tests**

```ts
expect(await discovery.discoverDaily(date, 8)).toHaveLength(8);
expect(internalSearch).toHaveBeenCalledBefore(externalSearch as jest.Mock);
expect(saved.every((quote) => quote.verified)).toBe(true);
```

Test that duplicates and unverified web results are discarded and replaced until eight candidates exist or the job fails with `insufficient_verified_quotes`.

- [ ] **Step 2: Run tests and verify failure**

Run: `pnpm --filter @vedamatch/api test -- --runInBand approved-web-source.service.spec.ts quote-discovery.service.spec.ts`

- [ ] **Step 3: Implement web fetching with redirect validation**

Use native `fetch`, a 20-second timeout, `User-Agent: VedaMatch-Motivation/1.0`, maximum response size 2 MB, and validate the final `response.url` again. Store only extracted text and attribution, never arbitrary HTML.

Implement the first keyless adapter through the Wikiquote MediaWiki Action API (`action=query&list=search&format=json&origin=*`) and keep each domain adapter behind `ApprovedWebSearchProvider`. Vedabase book content continues to use the internal PostgreSQL index; do not scrape it over HTTP when the same book exists locally.

- [ ] **Step 4: Implement internal-first discovery and idempotency**

Use `normalizedHash` uniqueness and a transaction. Do not create a post or image job in this task; create verified quote rows only.

- [ ] **Step 5: Replace daily post creation with daily discovery scheduling**

Keep the existing Redis lease and single-worker guard. Scheduler invokes `discoverDaily(today, 8)` once per UTC day using a Redis idempotency key.

- [ ] **Step 6: Run focused and full API tests**

Run: `pnpm --filter @vedamatch/api test -- --runInBand`

Expected: all API tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/motivation
git commit -m "feat(motivation): discover verified daily quotes"
```

### Task 5: AI-классификация, объяснение и переводы

**Files:**
- Create: `apps/api/src/modules/motivation/motivation-copy.service.ts`
- Create: `apps/api/src/modules/motivation/motivation-copy.service.spec.ts`
- Modify: `apps/api/src/modules/motivation/motivation-generation.service.ts`

**Interfaces:**
- Consumes: a verified `MotivationQuote` with context.
- Produces: `prepareCandidate(quoteId: string): Promise<MotivationPost>` in `text_review`.

- [ ] **Step 1: Write failing structured-output tests**

```ts
expect(result.profileTypes).toEqual(expect.arrayContaining(['devotee']));
expect(result.translations.ru.quoteText).toBe(originalText);
expect(result.translations.en.translationKind).toBe('vedamatch');
expect(result.explanation.length).toBeGreaterThan(20);
```

Reject unknown profiles, modified originals, more than two explanation paragraphs, or missing translation labels.

- [ ] **Step 2: Run test and verify failure**

Run: `pnpm --filter @vedamatch/api test -- --runInBand motivation-copy.service.spec.ts`

- [ ] **Step 3: Add a strict JSON contract to streamed Chat**

Prompt must include the verified quote and context and state: `Never alter originalText. Never add claims attributed to the speaker. Return profileTypes from user,in_goodness,yogi,devotee.` Validate output after parsing; restore `originalText` from the database rather than trusting model output.

- [ ] **Step 4: Persist translations, profiles and a text-review post**

Use one transaction. Set `reviewStatus: text_review`, `sourceVerified: true`, image fields null, and do not call `generateImage`.

- [ ] **Step 5: Run focused tests and build**

Run: `pnpm --filter @vedamatch/api test -- --runInBand motivation-copy.service.spec.ts motivation-generation.service.spec.ts && pnpm --filter @vedamatch/api build`

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/motivation
git commit -m "feat(motivation): prepare sourced quote copy"
```

### Task 6: Двухэтапная moderation API и image director

**Files:**
- Create: `apps/api/src/modules/motivation/motivation-moderation.service.ts`
- Create: `apps/api/src/modules/motivation/motivation-moderation.service.spec.ts`
- Create: `apps/api/src/modules/motivation/motivation-image-director.ts`
- Create: `apps/api/src/modules/motivation/motivation-image-director.spec.ts`
- Modify: `apps/api/src/modules/motivation/motivation.controller.ts`
- Modify: `apps/api/src/modules/motivation/motivation.service.ts`

**Interfaces:**
- Produces: `approveText(role, actorId, postId, styleOverride?)`.
- Produces: `approveImage(role, actorId, postId)`.
- Produces: `reject(role, actorId, postId, reason)`.
- Produces: `regenerateImage(role, actorId, postId, styleOverride?)`.

- [ ] **Step 1: Write failing state-transition tests**

```ts
await moderation.approveText('admin', actorId, postId);
expect(update.data.reviewStatus).toBe('image_queued');
expect(generateImage).not.toHaveBeenCalled();
await expect(moderation.approveImage('admin', actorId, textReviewId)).rejects.toThrow('Image is not ready for review');
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @vedamatch/api test -- --runInBand motivation-moderation.service.spec.ts motivation-image-director.spec.ts`

- [ ] **Step 3: Implement style selection as a pure function**

Map devotion/temple concepts to `spiritual_watercolor`, `indian_miniature`, or `sacred_architecture`; nature concepts to `cinematic_nature`; famous people to `historical_editorial`; fallback to `minimal_symbolism`. Return a prompt containing quote meaning, style instructions, `vertical 9:16`, `no text`, and `no logos`.

- [ ] **Step 4: Implement guarded transitions and audit rows**

Each update includes the expected current status in `updateMany`; zero updated rows returns conflict. Store actor, action, old/new status, style and reason in `MotivationModerationAudit`.

- [ ] **Step 5: Add admin endpoints**

```ts
@Post('admin/motivation/posts/:id/approve-text')
@Post('admin/motivation/posts/:id/approve-image')
@Post('admin/motivation/posts/:id/reject')
@Post('admin/motivation/posts/:id/regenerate-image')
```

- [ ] **Step 6: Run tests and build**

Run: `pnpm --filter @vedamatch/api test -- --runInBand && pnpm --filter @vedamatch/api build`

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/motivation
git commit -m "feat(motivation): add two-stage moderation workflow"
```

### Task 7: Последовательная генерация только после одобрения

**Files:**
- Modify: `apps/api/src/modules/motivation/motivation-worker.service.ts`
- Modify: `apps/api/src/modules/motivation/motivation-worker.service.spec.ts`
- Modify: `apps/api/src/modules/motivation/motivation-generation.service.ts`

**Interfaces:**
- Consumes: posts in `image_queued` with approved copy and stored `imagePrompt`.
- Produces: posts in `image_review` with a public PNG URL.

- [ ] **Step 1: Write failing queue-gate tests**

```ts
expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ reviewStatus: 'image_queued' }) }));
expect(generateImage).not.toHaveBeenCalledWith(expect.stringContaining('unapproved'));
expect(publishedUpdate).not.toHaveBeenCalled();
expect(imageReviewUpdate.data.reviewStatus).toBe('image_review');
```

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @vedamatch/api test -- --runInBand motivation-worker.service.spec.ts`

- [ ] **Step 3: Change worker claim and completion states**

Claim only `image_queued`, retain `running` guard and 300-second Redis lease, upload with `ACL: public-read`, and finish at `image_review`. Do not set `publishedAt`; `approveImage` does that.

- [ ] **Step 4: Preserve approved text on failure**

On provider failure return to `image_queued` while attempts remain, otherwise set `failed` with `generationStage: image`. Never delete translations or source attribution.

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @vedamatch/api test -- --runInBand motivation-worker.service.spec.ts motivation-generation.service.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/motivation
git commit -m "feat(motivation): gate image generation on approval"
```

### Task 8: Админка двух очередей

**Files:**
- Modify: `apps/web/src/app/admin/motivation/page.tsx`
- Modify: `apps/web/src/components/motivation/motivation-admin-controls.tsx`
- Modify: `apps/web/src/components/motivation/motivation-admin-controls.spec.tsx`
- Modify: `apps/web/src/lib/motivation-api.ts`

**Interfaces:**
- Consumes: `MotivationAdminCandidateDto[]` and moderation endpoints.
- Produces: text-review and image-review controls.

- [ ] **Step 1: Write failing UI tests**

```tsx
expect(screen.getByRole('heading', { name: 'Цитаты и текст' })).toBeInTheDocument();
expect(screen.getByRole('link', { name: 'Открыть источник' })).toHaveAttribute('href', sourceUrl);
expect(screen.queryByRole('button', { name: 'Сгенерировать изображение' })).not.toBeInTheDocument();
await user.click(screen.getByRole('button', { name: 'Одобрить текст' }));
expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/approve-text'), expect.anything());
```

Add a separate `image_review` fixture verifying `Опубликовать`, `Перегенерировать`, and style selection.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm --filter @vedamatch/web test -- --runInBand motivation-admin-controls.spec.tsx`

- [ ] **Step 3: Split controls into focused cards**

Create local components `QuoteReviewCard` and `ImageReviewCard` in the same file initially. Show original, translation label, author/work/locator, context excerpt, profiles, source link, explanation, style and prompt.

- [ ] **Step 4: Add typed API commands and error rendering**

Send reason JSON for reject and optional `visualStyle` for approve/regenerate. Disable all actions while a request for that post is pending.

- [ ] **Step 5: Run web tests and build**

Run: `pnpm --filter @vedamatch/web test -- --runInBand && pnpm --filter @vedamatch/web build`

Expected: all web tests PASS and build exit `0`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/admin/motivation apps/web/src/components/motivation apps/web/src/lib/motivation-api.ts
git commit -m "feat(motivation): add quote and image review queues"
```

### Task 9: End-to-end verification and production rollout

**Files:**
- Modify: `.env.example`
- Modify: `README.md`
- Test: `apps/api/src/modules/motivation/*.spec.ts`
- Test: `apps/web/src/components/motivation/*.spec.tsx`

**Interfaces:**
- Consumes all previous tasks.
- Produces deployable documentation and verification evidence.

- [ ] **Step 1: Document configuration without secrets**

```env
MOTIVATION_APPROVED_SOURCE_DOMAINS=vedabase.io,vedabase.com,prabhupadabooks.com,wikiquote.org
MOTIVATION_DAILY_CANDIDATE_COUNT=8
MOTIVATION_IMAGE_TIMEOUT_MS=180000
```

- [ ] **Step 2: Run complete local validation**

Run: `pnpm --filter @vedamatch/api test -- --runInBand && pnpm --filter @vedamatch/api build && pnpm --filter @vedamatch/web test -- --runInBand && pnpm --filter @vedamatch/web build`

Expected: zero failed suites and both builds exit `0`.

- [ ] **Step 3: Apply migration in staging/production**

Run through the existing Dokploy API startup command: `pnpm prisma migrate deploy`.

Expected: migration reports applied and API health is `200`.

- [ ] **Step 4: Verify the moderation contract in production**

Create eight candidates; confirm all begin in `text_review` and have no image URL. Approve one text, verify exactly one image job starts, and confirm it reaches `image_review` without public feed visibility.

- [ ] **Step 5: Approve the image and verify publication**

Confirm `/motivation/posts/:slug` returns `200`, `/m/:slug` renders the exact quote and attribution, and `imageUrl` downloads with HTTP `200` and PNG signature `89 50 4E 47 0D 0A 1A 0A`.

- [ ] **Step 6: Rotate temporary provider credentials**

Set `MOTIVATION_AI_API_KEY` in Dokploy environment, remove any hardcoded temporary key from compose patches, redeploy, and verify health plus one controlled generation.

- [ ] **Step 7: Commit documentation**

```bash
git add .env.example README.md
git commit -m "docs(motivation): document verified quote operations"
```
