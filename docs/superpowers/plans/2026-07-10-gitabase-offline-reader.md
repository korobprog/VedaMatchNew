# VedaMatch Union Gitabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в портал `/gitabase` с 15 книгами, офлайн-загрузкой, поиском, прогрессом, закладками, заметками, выделениями и синхронизацией между устройствами.

**Architecture:** Одноразовый importer workspace создаёт неизменяемые пакеты книг в `GITABASE_CONTENT_DIR`. NestJS отдаёт защищённые manifest/files и синхронизирует пользовательские сущности в PostgreSQL; Next.js отображает библиотеку и читалку, а IndexedDB хранит скачанные пакеты и очередь офлайн-изменений.

**Tech Stack:** pnpm 11/Turborepo, TypeScript, Next.js 16 App Router, React 19, Tailwind 4, NestJS 11, Prisma 6/PostgreSQL 16, IndexedDB через `idb`, native Service Worker, Cheerio, sanitize-html, Vitest, Jest, Playwright.

## Global Constraints

- Сервис работает внутри `apps/web` по маршруту `/gitabase` с текущей авторизацией VedaMatch.
- Импортируются все 15 книг из разрешённого каталога; browser runtime никогда не обращается к `vedabase.ru`.
- Импорт однократный; scheduler и административный UI импорта не создаются.
- Нельзя обращаться к `/ajax.php`, `/next.php`, `/go.php` или `/go_to_search.php`.
- Пакет книги активируется только после проверки всех SHA-256; незавершённые версии остаются в staging.
- Полные тексты не записываются в PostgreSQL или git; они находятся только в `GITABASE_CONTENT_DIR` и IndexedDB пользователя.
- IndexedDB namespace содержит `userId`; logout очищает активный локальный профиль и Gitabase caches.
- API-модуль не импортирует другие feature modules; Prisma-модели имеют префикс `Gitabase`.
- Основные платформы MVP: Chrome/Edge desktop и Chrome Android.
- Не создавать git commits, пока пользователь явно не попросит.

---

### Task 1: Shared contracts and web test harness

**Files:**
- Create: `packages/shared/src/gitabase.ts`
- Modify: `packages/shared/src/index.ts:1`
- Modify: `apps/web/package.json:1`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/src/lib/gitabase/contracts.spec.ts`

**Interfaces:**
- Produces: `GitabaseLibraryManifest`, `GitabaseBookManifest`, `GitabaseChapterDocument`, `GitabaseReadingUnit`, `GitabasePackageFile`, `GitabaseLocator`, `GitabaseClientMutation`, `GitabaseSyncPushRequest`, `GitabaseSyncPushResponse`, `GitabaseSyncPullResponse`.
- Consumes: existing `@vedamatch/shared` export pattern.

- [ ] **Step 1: Add a failing contract fixture test**

```ts
import { describe, expect, it } from "vitest";
import type { GitabaseLibraryManifest } from "@vedamatch/shared";

describe("Gitabase contracts", () => {
  it("represents an immutable 15-book library", () => {
    const manifest = { formatVersion: 1, generatedAt: "2026-07-10T00:00:00.000Z", books: [] } satisfies GitabaseLibraryManifest;
    expect(manifest.formatVersion).toBe(1);
  });
});
```

- [ ] **Step 2: Install the local storage and test dependencies**

Run:

```powershell
pnpm --filter @vedamatch/web add idb
pnpm --filter @vedamatch/web add -D vitest jsdom fake-indexeddb @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test
```

Expected: `apps/web/package.json` and `pnpm-lock.yaml` contain the new dependencies.

- [ ] **Step 3: Configure Vitest**

```ts
// apps/web/vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "jsdom", setupFiles: ["./vitest.setup.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
```

```ts
// apps/web/vitest.setup.ts
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
```

Add scripts: `"test": "vitest run"`, `"test:watch": "vitest"`, `"test:e2e": "playwright test"`.

- [ ] **Step 4: Define the exact shared shapes**

```ts
export interface GitabasePackageFile { path: string; bytes: number; sha256: string; contentType: string }
export interface GitabaseLocator { bookSlug: string; chapterSlug: string; unitId: string; block?: string; start?: number; end?: number }
export interface GitabaseReadingUnit {
  id: string; title: string; sourceUrl: string;
  originalHtml?: string; transliterationHtml?: string; synonymsHtml?: string;
  translationHtml?: string; purportHtml?: string; bodyHtml?: string;
}
export interface GitabaseChapterDocument { bookSlug: string; slug: string; title: string; order: number; units: GitabaseReadingUnit[] }
export interface GitabaseBookManifest {
  formatVersion: 1; slug: string; title: string; author: string | null; language: "ru";
  contentVersion: string; packageChecksum: string; sizeBytes: number; coverPath: string | null;
  sourceUrl: string; sourceOrigin: "https://vedabase.ru"; importedAt: string;
  permissionRef: string; attribution: string; chapters: Array<{ slug: string; title: string; order: number; file: string }>;
  files: GitabasePackageFile[];
}
export interface GitabaseLibraryManifest { formatVersion: 1; generatedAt: string; books: GitabaseBookManifest[] }
export type GitabaseMutationEntity = "progress" | "bookmark" | "annotation";
export interface GitabaseClientMutation { clientMutationId: string; entity: GitabaseMutationEntity; entityId: string; baseRevision: number | null; payload: unknown; createdAt: string }
export interface GitabaseSyncPushRequest { mutations: GitabaseClientMutation[] }
export interface GitabaseSyncPushResponse { accepted: Array<{ clientMutationId: string; revision: number }>; cursor: string }
export interface GitabaseSyncPullResponse { changes: Array<{ entity: GitabaseMutationEntity; entityId: string; revision: number; payload: unknown }>; cursor: string }
```

- [ ] **Step 5: Verify types and tests**

Run: `pnpm --filter @vedamatch/shared lint; pnpm --filter @vedamatch/web test -- contracts.spec.ts`

Expected: both commands exit `0`.

### Task 2: Importer workspace and source policy

**Files:**
- Create: `packages/gitabase-importer/package.json`
- Create: `packages/gitabase-importer/tsconfig.json`
- Create: `packages/gitabase-importer/src/catalog.ts`
- Create: `packages/gitabase-importer/src/source-policy.ts`
- Create: `packages/gitabase-importer/src/sitemap.ts`
- Create: `packages/gitabase-importer/test/fixtures/sitemap.xml`
- Create: `packages/gitabase-importer/test/source-policy.spec.ts`
- Create: `packages/gitabase-importer/test/sitemap.spec.ts`

**Interfaces:**
- Consumes: shared manifest types from Task 1.
- Produces: `assertAllowedSourceUrl(url: URL): void`, `parseSitemap(xml: string, selectedSlugs: Set<string>): URL[]`, immutable `GITABASE_BOOK_SLUGS` with exactly 15 entries.

- [ ] **Step 1: Scaffold the isolated workspace**

Use the exact package scripts `build: tsc --noEmit`, `lint: tsc --noEmit`, `test: node --import tsx --test test/**/*.spec.ts`, `import: tsx src/cli.ts`; add `cheerio`, `sanitize-html`, `tsx`, TypeScript and their types without adding them to the runtime API.

- [ ] **Step 2: Write failing policy tests**

```ts
for (const url of [
  "https://vedabase.ru/ajax.php", "https://vedabase.ru/next.php",
  "https://vedabase.ru/go.php", "https://vedabase.ru/go_to_search.php",
  "https://vedabase.ru/bhagavad-gita/?query=x", "https://example.com/bhagavad-gita/",
]) assert.throws(() => assertAllowedSourceUrl(new URL(url)));
```

- [ ] **Step 3: Implement the deny-by-default URL policy**

Allow only `https:`, hostname `vedabase.ru`, no credentials/query/hash, `/sitemap.xml`, or clean trailing-slash HTML paths whose first segment is in `GITABASE_BOOK_SLUGS`; reject every `.php` path and revalidate redirects.

- [ ] **Step 4: Test and implement sitemap parsing**

The fixture must prove origin filtering, selected-book filtering, deduplication and ignored `lastmod`. Preserve sitemap membership only; do not infer reading order from sitemap sorting.

- [ ] **Step 5: Verify the workspace**

Run: `pnpm --filter @vedamatch/gitabase-importer test; pnpm --filter @vedamatch/gitabase-importer build`

Expected: tests and typecheck pass.

### Task 3: Resumable source fetcher and HTML parser

**Files:**
- Create: `packages/gitabase-importer/src/fetcher.ts`
- Create: `packages/gitabase-importer/src/cache.ts`
- Create: `packages/gitabase-importer/src/parse-page.ts`
- Create: `packages/gitabase-importer/src/sanitize.ts`
- Create: `packages/gitabase-importer/test/fetcher.spec.ts`
- Create: `packages/gitabase-importer/test/parse-page.spec.ts`
- Create: `packages/gitabase-importer/test/sanitize.spec.ts`
- Create: `packages/gitabase-importer/test/fixtures/verse-page-with-next-contents.html`
- Create: `packages/gitabase-importer/test/fixtures/prose-page-with-general-purport.html`
- Create: `packages/gitabase-importer/test/fixtures/unsafe-page.html`

**Interfaces:**
- Produces: `SourceFetcher.get(url)`, `ParsedSourcePage`, `sanitizeSourceHtml(html)`.
- Consumes: Task 2 source policy.

- [ ] **Step 1: Write fetch/cache failure tests**

Test sequential requests, `minDelayMs=1500`, 60-second timeout, maximum three attempts, `Retry-After` for 429, exponential retry for network/5xx, fatal 4xx/content-type errors, manual redirect validation, and cache reuse on `resume`.

- [ ] **Step 2: Implement `SourceFetcher`**

```ts
export interface SourceFetcher {
  get(url: URL): Promise<{ requestedUrl: string; finalUrl: string; contentType: string; body: string; sha256: string }>;
}
```

Send `User-Agent: VedaMatchGitabaseImporter/1.0 (+info@vedabase.ru)`, keep concurrency at one, and persist body plus metadata keyed by canonical URL hash.

- [ ] **Step 3: Write parser failure tests**

Assert that `#next-contents` is removed before selection, only `#content #verse-block:first` becomes the current unit, prose collects `.general-purport` in DOM order, and canonical URL/title are required.

- [ ] **Step 4: Implement parsing and sanitization**

Map `.verse-text`, `.verse-transcription`, `.verse-synonyms`, `.verse-translation`, `.verse-purport`, and `.general-purport`. Preserve only `p`, `br`, `em`, `strong`, `a[href]`, `sup`, `sub`, `ul`, `ol`, `li`, `blockquote`; remove scripts, iframes, style, `on*` and unsafe URL schemes.

- [ ] **Step 5: Verify parser isolation**

Run: `pnpm --filter @vedamatch/gitabase-importer test`

Expected: no live network calls; all synthetic fixtures pass.

### Task 4: Deterministic package builder and import CLI

**Files:**
- Create: `packages/gitabase-importer/src/toc.ts`
- Create: `packages/gitabase-importer/src/locators.ts`
- Create: `packages/gitabase-importer/src/search-index.ts`
- Create: `packages/gitabase-importer/src/package-builder.ts`
- Create: `packages/gitabase-importer/src/validator.ts`
- Create: `packages/gitabase-importer/src/writer.ts`
- Create: `packages/gitabase-importer/src/import-book.ts`
- Create: `packages/gitabase-importer/src/import-library.ts`
- Create: `packages/gitabase-importer/src/cli.ts`
- Create: `packages/gitabase-importer/test/package-builder.spec.ts`
- Create: `packages/gitabase-importer/test/import-book.spec.ts`
- Create: `docs/gitabase-import.md`

**Interfaces:**
- Produces: `$GITABASE_CONTENT_DIR/library-manifest.json` and `books/<slug>/<version>/{manifest.json,chapters/*.json,search-index.json,assets/*}`.
- Consumes: Tasks 1–3.

- [ ] **Step 1: Write deterministic builder tests**

Prove parent-link order `1,2,10`, stable locators across runs, byte-identical search postings, sorted checksum input `relativePath + NUL + sha256`, duplicate/orphan detection, immutable version rejection and atomic `.staging` rename.

- [ ] **Step 2: Implement deterministic TOC, locators and search index**

Use normalized Unicode tokens and postings `{ token: string, hits: Array<{ chapterSlug: string; unitId: string; field: string }> }`; never depend on locale sorting without an explicit comparator.

- [ ] **Step 3: Implement validation and atomic writer**

Write every file under `.staging/<runId>`, validate counts/paths/SHA-256/rights metadata, rename to final immutable version, then atomically replace `library-manifest.json` through `.tmp`.

- [ ] **Step 4: Implement CLI commands**

Provide `plan`, `import`, and `validate`. Refuse `import` without `--permission-ref` and attribution. `--all` processes the 15 allowlisted slugs sequentially; `--resume` reuses the cache.

- [ ] **Step 5: Document and verify dry-run behavior**

Run: `pnpm --filter @vedamatch/gitabase-importer import -- plan --book bhagavad-gita --source https://vedabase.ru --sitemap https://vedabase.ru/sitemap.xml`

Expected: one sitemap request, a printed URL count, and no book-page request.

### Task 5: Protected content delivery API

**Files:**
- Create: `apps/api/src/modules/gitabase/gitabase.module.ts`
- Create: `apps/api/src/modules/gitabase/gitabase-content.service.ts`
- Create: `apps/api/src/modules/gitabase/gitabase-content.controller.ts`
- Create: `apps/api/src/modules/gitabase/gitabase-content.service.spec.ts`
- Modify: `apps/api/src/app.module.ts:1`
- Modify: `.env.example:1`

**Interfaces:**
- Produces: `GET /gitabase/library`, `GET /gitabase/books/:bookSlug/manifest`, `GET /gitabase/content/:bookSlug/:version/*path`.
- Consumes: package layout from Task 4 and current `AuthGuard`.

- [ ] **Step 1: Write failing filesystem boundary tests**

Test manifest success, missing manifest `404`, bad checksum metadata `500`, unknown book `404`, traversal paths such as `../schema.prisma` `400`, and resolved paths outside `GITABASE_CONTENT_DIR` `400`.

- [ ] **Step 2: Implement `GitabaseContentService`**

```ts
interface ResolvedContentFile { absolutePath: string; etag: string; bytes: number; contentType: string }
```

Read and validate JSON against required fields, resolve only manifest-declared files, and never concatenate an unchecked request path.

- [ ] **Step 3: Implement guarded streaming routes**

Use `@UseGuards(AuthGuard)`, `StreamableFile`, `Content-Length`, quoted SHA-256 `ETag`, `Cache-Control: private, max-age=31536000, immutable` for versioned files and `no-cache` for the library manifest.

- [ ] **Step 4: Register the isolated module and environment**

Add only `GitabaseModule` to `AppModule`; document `GITABASE_CONTENT_DIR=/var/lib/vedamatch/gitabase`.

- [ ] **Step 5: Verify API**

Run: `pnpm --filter @vedamatch/api exec jest gitabase-content.service.spec.ts --runInBand; pnpm --filter @vedamatch/api build`

Expected: PASS and successful Nest build.

### Task 6: Prisma user-state schema and migration

**Files:**
- Modify: `apps/api/prisma/schema.prisma:20`
- Create: `apps/api/prisma/migrations/20260710_gitabase_user_state/migration.sql`
- Create: `apps/api/src/modules/gitabase/gitabase-user-state.service.spec.ts`

**Interfaces:**
- Produces Prisma models: `GitabaseReadingProgress`, `GitabaseBookmark`, `GitabaseAnnotation`, `GitabaseAnnotationRevision`, `GitabaseSyncMutation`; enum `GitabaseAnnotationKind`.
- Consumes: common `User` only.

- [ ] **Step 1: Add failing schema expectations to the service test**

Mock Prisma clients with the exact model names and verify progress upsert, bookmark tombstone, annotation revision history and idempotent mutation lookup.

- [ ] **Step 2: Add the prefixed Prisma block**

Use client-generated string IDs for bookmark/annotation, `Json` locators/ranges, integer `revision`, nullable `deletedAt`, and unique `[userId, clientMutationId]`. Add only the corresponding relations to `User`.

- [ ] **Step 3: Write explicit PostgreSQL migration SQL**

Create enum, tables, unique/index constraints and foreign keys with `ON DELETE CASCADE ON UPDATE CASCADE`; do not create book-content tables.

- [ ] **Step 4: Validate and generate Prisma**

Run: `pnpm --filter @vedamatch/api exec prisma validate; pnpm --filter @vedamatch/api prisma:generate`

Expected: schema valid and generated client includes all five models.

### Task 7: Sync and user-state API

**Files:**
- Create: `apps/api/src/modules/gitabase/gitabase-user-state.service.ts`
- Create: `apps/api/src/modules/gitabase/gitabase-sync.service.ts`
- Create: `apps/api/src/modules/gitabase/gitabase-sync.controller.ts`
- Create: `apps/api/src/modules/gitabase/gitabase-sync.service.spec.ts`
- Modify: `apps/api/src/modules/gitabase/gitabase.module.ts:1`

**Interfaces:**
- Produces: `POST /gitabase/sync/push`, `GET /gitabase/sync/pull?after=<cursor>`.
- Consumes: shared sync types and Prisma models from Task 6.

- [ ] **Step 1: Write failing sync tests**

Test a mutation batch, duplicated `clientMutationId`, cursor pagination, progress last-server-write, bookmark/annotation tombstones, base-revision conflict, and saved previous note text.

- [ ] **Step 2: Implement runtime validation**

Reject more than 100 mutations, unknown entity names, blank IDs, invalid locators, note text over 20,000 characters and malformed cursors with `BadRequestException`.

- [ ] **Step 3: Implement transactional push**

For each unseen mutation, update the materialized entity, increment revision, save the previous note in `GitabaseAnnotationRevision` on conflicting edits, then insert `GitabaseSyncMutation`. Return accepted IDs and a server cursor.

- [ ] **Step 4: Implement ordered pull**

Return only the authenticated user's changes after the cursor, ordered by `(createdAt,id)`, maximum 500 changes, including tombstones.

- [ ] **Step 5: Verify sync behavior**

Run: `pnpm --filter @vedamatch/api exec jest gitabase-sync.service.spec.ts --runInBand`

Expected: all conflict and idempotency tests pass.

### Task 8: Server routes and browser API clients

**Files:**
- Create: `apps/web/src/lib/gitabase-api.ts`
- Create: `apps/web/src/lib/gitabase-client-api.ts`
- Create: `apps/web/src/app/gitabase/layout.tsx`
- Create: `apps/web/src/app/gitabase/page.tsx`
- Create: `apps/web/src/app/gitabase/books/[bookSlug]/[chapterSlug]/page.tsx`
- Create: `apps/web/src/app/gitabase/loading.tsx`
- Create: `apps/web/src/app/gitabase/error.tsx`

**Interfaces:**
- Produces server functions `getGitabaseLibrary()` and browser functions `fetchGitabaseBookManifest`, `fetchGitabasePackageFile`, `pushGitabaseMutations`, `pullGitabaseChanges`.
- Consumes: existing `getProfile()`, `Header`, shared contracts, API routes from Tasks 5 and 7.

- [ ] **Step 1: Write client API tests with mocked fetch**

Assert `credentials: "include"`, URL encoding, `AbortSignal` forwarding, JSON error propagation and binary file return.

- [ ] **Step 2: Implement separated server/browser clients**

Keep `next/headers` only in `gitabase-api.ts`; never import it into client components. Use Bearer forwarding server-side and credentialed cookies browser-side.

- [ ] **Step 3: Create authenticated routes**

Both pages call `getProfile()` and `redirect("/login")` when absent. Library loads the initial manifest; reader passes `user.id`, `bookSlug` and `chapterSlug` to the client shell without embedding book text in HTML.

- [ ] **Step 4: Add metadata and resilient route UI**

Set title `VedaMatch Union Gitabase`, manifest `/gitabase.webmanifest`, and Russian loading/error copy with a retry action.

- [ ] **Step 5: Verify route compilation**

Run: `pnpm --filter @vedamatch/web test; pnpm --filter @vedamatch/web build`

Expected: tests pass and Next generates `/gitabase` routes.

### Task 9: User-scoped IndexedDB and package validation

**Files:**
- Create: `apps/web/src/lib/gitabase/local-db.ts`
- Create: `apps/web/src/lib/gitabase/book-storage.ts`
- Create: `apps/web/src/lib/gitabase/package-validator.ts`
- Create: `apps/web/src/lib/gitabase/book-storage.spec.ts`
- Create: `apps/web/src/lib/gitabase/package-validator.spec.ts`

**Interfaces:**
- Produces `openGitabaseDb(userId)`, `GitabaseBookStorage`, atomic staging/activation and local mutation stores.
- Consumes: `idb` and shared manifest types.

- [ ] **Step 1: Write failing storage tests**

Use `fake-indexeddb` to prove user isolation, staged file persistence, atomic activation, rollback on bad SHA-256, chapter retrieval, retained annotations after book deletion and database cleanup on logout.

- [ ] **Step 2: Create schema version 1**

Object stores: `library`, `bookVersions`, `files`, `downloadState`, `preferences`, `progress`, `bookmarks`, `annotations`, `mutationQueue`, `syncMeta`; database name `vedamatch-gitabase-${userId}`.

- [ ] **Step 3: Implement SHA-256 validation**

Use `crypto.subtle.digest("SHA-256", buffer)` and compare lowercase hex to each manifest digest before marking a file verified.

- [ ] **Step 4: Implement `GitabaseBookStorage`**

```ts
interface GitabaseBookStorage {
  stageFile(bookSlug: string, version: string, file: GitabasePackageFile, body: Blob): Promise<void>;
  activateVersion(bookSlug: string, version: string): Promise<void>;
  getChapter(bookSlug: string, chapterSlug: string): Promise<GitabaseChapterDocument | null>;
  removeBook(bookSlug: string): Promise<void>;
}
```

- [ ] **Step 5: Verify local storage**

Run: `pnpm --filter @vedamatch/web test -- book-storage.spec.ts package-validator.spec.ts`

Expected: all IndexedDB and checksum tests pass.

### Task 10: Download manager and library UI

**Files:**
- Create: `apps/web/src/lib/gitabase/download-manager.ts`
- Create: `apps/web/src/lib/gitabase/download-manager.spec.ts`
- Create: `apps/web/src/components/gitabase/gitabase-provider.tsx`
- Create: `apps/web/src/components/gitabase/library-screen.tsx`
- Create: `apps/web/src/components/gitabase/book-card.tsx`
- Create: `apps/web/src/components/gitabase/download-all-panel.tsx`
- Create: `apps/web/src/components/gitabase/offline-indicator.tsx`

**Interfaces:**
- Produces `GitabaseDownloadManager.downloadBook`, `resumeBook`, `downloadLibrary`, `removeBook` and React provider state.
- Consumes: Task 9 storage and Task 8 browser API.

- [ ] **Step 1: Write failing download tests**

Test one-book download, all-book sequential queue, real byte progress, abort/pause, missing-file resume, quota error, checksum retry and no activation before complete validation.

- [ ] **Step 2: Implement quota-aware downloads**

Call `navigator.storage.estimate()` and request `navigator.storage.persist()` after the first explicit download. Fetch files sequentially per book, persist progress after each file, and preserve verified files after abort.

- [ ] **Step 3: Write component behavior tests**

Test filters, title search, download/remove buttons, paused/resumed labels, total size, download-all progress and offline status using Testing Library.

- [ ] **Step 4: Implement the library components**

Render 15 manifest cards, filters `all/downloaded/not-downloaded/started/completed`, and actions `Читать`, `Скачать`, `Продолжить`, `Удалить с устройства`.

- [ ] **Step 5: Verify library behavior**

Run: `pnpm --filter @vedamatch/web test -- download-manager.spec.ts library-screen`

Expected: download and UI tests pass.

### Task 11: Reader, search, progress and annotations

**Files:**
- Create: `apps/web/src/lib/gitabase/search-index.ts`
- Create: `apps/web/src/lib/gitabase/locators.ts`
- Create: `apps/web/src/components/gitabase/reader-screen.tsx`
- Create: `apps/web/src/components/gitabase/reader-toolbar.tsx`
- Create: `apps/web/src/components/gitabase/table-of-contents.tsx`
- Create: `apps/web/src/components/gitabase/chapter-content.tsx`
- Create: `apps/web/src/components/gitabase/search-dialog.tsx`
- Create: `apps/web/src/components/gitabase/annotation-toolbar.tsx`
- Create: `apps/web/src/components/gitabase/reader-screen.spec.tsx`

**Interfaces:**
- Produces client reader for local chapters, deterministic locator/range serialization, search across downloaded indexes, local progress/bookmark/annotation mutations.
- Consumes: Tasks 1, 9 and 10.

- [ ] **Step 1: Write failing reader tests**

Test last-position restore, previous/next chapter, missing offline chapter message, theme/font/width preferences, bookmark toggle, selection-to-highlight, note editing and search result navigation.

- [ ] **Step 2: Implement local search**

Normalize query Unicode exactly like the importer, intersect postings for multiple tokens, group by book/chapter/unit and return a short plain-text snippet without injecting indexed HTML.

- [ ] **Step 3: Implement safe chapter rendering**

Render only importer-sanitized fields, still pass them through a small client allowlist adapter, assign stable DOM IDs from `unitId`, and never execute source scripts or inline handlers.

- [ ] **Step 4: Implement preferences and local mutations**

Persist light/dark/sepia, font size and line width. Progress, bookmarks and annotations update IndexedDB first and enqueue a `GitabaseClientMutation` with `crypto.randomUUID()`.

- [ ] **Step 5: Verify reader behavior**

Run: `pnpm --filter @vedamatch/web test -- reader-screen.spec.tsx`

Expected: reading, search and annotation tests pass.

### Task 12: Sync engine, PWA shell and logout cleanup

**Files:**
- Create: `apps/web/src/lib/gitabase/sync-engine.ts`
- Create: `apps/web/src/lib/gitabase/sync-engine.spec.ts`
- Create: `apps/web/src/lib/gitabase/register-service-worker.ts`
- Create: `apps/web/src/app/gitabase/offline/page.tsx`
- Create: `apps/web/src/components/gitabase/offline-router.tsx`
- Create: `apps/web/src/components/gitabase/sync-status.tsx`
- Create: `apps/web/public/gitabase/sw.js`
- Create: `apps/web/public/gitabase.webmanifest`
- Modify: `apps/web/src/proxy.ts:1`
- Modify: `apps/web/src/components/logout-button.tsx:1`

**Interfaces:**
- Produces `GitabaseSyncEngine.enqueue/flush/pull`, generic offline fallback and cache/database purge message.
- Consumes: Tasks 7–11.

- [ ] **Step 1: Write failing sync-engine tests**

Test offline enqueue, ordered batch push, accepted mutation removal, pull cursor persistence, retry backoff, duplicate response handling and `online` event flush.

- [ ] **Step 2: Implement client sync**

Flush at provider startup, on `online`, and after local mutations with debounce. Never block reading; expose `local`, `pending`, `synced`, `error` states.

- [ ] **Step 3: Implement generic offline shell**

The shell contains no user name or personalized server HTML. It reads `activeUserId` from local storage, parses the current `/gitabase` pathname and renders local library/reader data; otherwise it shows a login-required offline message.

- [ ] **Step 4: Implement the scoped service worker**

Register `/gitabase/sw.js` with scope `/gitabase/`. Runtime-cache only same-origin `/_next/static/*`, manifest/icons and the generic offline shell; on failed `/gitabase/*` navigation return the cached shell. Do not cache personalized navigation responses.

- [ ] **Step 5: Make PWA assets reachable and logout safe**

Exclude `/gitabase/sw.js` and `/gitabase.webmanifest` from auth proxy blocking. Before redirecting after logout, post `CLEAR_GITABASE_CACHE` to the worker, delete the active user's IndexedDB database and remove `activeUserId`.

- [ ] **Step 6: Verify offline plumbing**

Run: `pnpm --filter @vedamatch/web test -- sync-engine.spec.ts; pnpm --filter @vedamatch/web build`

Expected: sync tests pass; manifest and service worker are present in the standalone output.

### Task 13: Portal activation and deployment storage

**Files:**
- Modify: `apps/api/prisma/seed.ts:21`
- Modify: `apps/api/prisma/seed.cjs:22`
- Modify: `docker-compose.yml:1`
- Modify: `portal/docker-compose.dokploy.yml:1`
- Modify: `.env.example:1`
- Create: `docs/gitabase-deployment.md`

**Interfaces:**
- Produces active portal card `/gitabase` and mounted read-only content volume in API runtime.
- Consumes: completed API, web and validated content packages.

- [ ] **Step 1: Add deployment volume configuration**

Mount host/volume content at `/var/lib/vedamatch/gitabase:ro` for API and set `GITABASE_CONTENT_DIR` in local and Dokploy compose. Document ownership and atomic replacement procedure.

- [ ] **Step 2: Keep the card disabled until acceptance passes**

During implementation set only `url: "/gitabase"`; retain `status: "coming_soon"` in both TypeScript and CJS seeds.

- [ ] **Step 3: Validate one imported book in staging**

Run `pnpm --filter @vedamatch/gitabase-importer import -- validate --content-dir $env:GITABASE_CONTENT_DIR` and manually inspect counts, five random pages and attribution.

- [ ] **Step 4: Import and validate all 15 books**

Run the documented `--all --resume` command with `GITABASE_SOURCE_PERMISSION_REF`, then validate again. Expected: exactly 15 books, no missing file, duplicate locator or checksum error.

- [ ] **Step 5: Activate the card**

Change both seeds to `status: "active"`, run `pnpm --filter @vedamatch/api seed`, and confirm `/services` returns `/gitabase` as active.

### Task 14: Automated acceptance and final verification

**Files:**
- Create: `apps/web/playwright.config.ts`
- Create: `apps/web/e2e/gitabase-offline.spec.ts`
- Create: `apps/web/e2e/auth-state.ts`
- Replace: `apps/api/test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: running web/API/PostgreSQL, validated 15-book content volume and `TEST_ACCESS_TOKEN` for an existing seeded test user.
- Produces: reproducible acceptance evidence for online, offline and second-device sync flows.

- [ ] **Step 1: Replace the stale Hello World e2e test**

Assert an unauthenticated protected endpoint returns `401` and an authenticated Gitabase library request returns `200`; do not retain the removed `GET /` expectation.

- [ ] **Step 2: Configure Playwright auth state**

Require `TEST_ACCESS_TOKEN` and `TEST_USER_ID`, set the `access_token` cookie for the configured portal domain, and fail fast with a clear message when either is absent.

- [ ] **Step 3: Implement the offline acceptance scenario**

Automate: open portal, enter Gitabase, download one small book, create bookmark/note/highlight, set browser offline, reload reader and search locally, return online, wait for `Синхронизировано`, open a second context and confirm the same state.

- [ ] **Step 4: Run focused verification**

```powershell
pnpm --filter @vedamatch/shared lint
pnpm --filter @vedamatch/gitabase-importer test
pnpm --filter @vedamatch/api exec prisma validate
pnpm --filter @vedamatch/api exec jest --runInBand
pnpm --filter @vedamatch/web lint
pnpm --filter @vedamatch/web test
pnpm --filter @vedamatch/web build
```

Expected: every command exits `0`.

- [ ] **Step 5: Run browser acceptance**

Run: `pnpm --filter @vedamatch/web exec playwright install chromium; pnpm --filter @vedamatch/web test:e2e`

Expected: Gitabase offline/sync scenario passes in Chromium.

- [ ] **Step 6: Review the final diff**

Run: `git diff --check; git status --short`

Expected: no whitespace errors; only Gitabase, required shared/deployment files, the approved spec and this plan are changed. Do not commit without an explicit user request.
