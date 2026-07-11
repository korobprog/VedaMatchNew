# Vedabase PostgreSQL Offline Reader Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the existing offline reader as `https://vedamatch.ru/vedabase`, store canonical book content imported from `https://vedabase.ru/` in PostgreSQL, and prove downloaded books remain readable and searchable offline from browser IndexedDB.

**Architecture:** Preserve the existing parser, package builder, reader, IndexedDB, and synchronization work. Replace filesystem publication and filesystem-backed API reads with immutable PostgreSQL book versions containing normalized metadata, JSONB chapter payloads, and searchable units. Rename the public module and routes to Vedabase, retain `/gitabase` only as a redirect, then import and validate the fixed 15-book catalog before activating the service card.

**Tech Stack:** pnpm workspace, TypeScript 5.9, NestJS 11, Prisma 6.16, PostgreSQL 16, Next.js 16, React 19, IndexedDB/idb, Vitest 4, Jest 30, Playwright 1.61.

## Global Constraints

- Do not discard or overwrite the current staged and unstaged Vedabase/Gitabase work.
- Canonical public route and API prefix are `/vedabase`.
- Source origin is exactly `https://vedabase.ru`.
- The first release contains exactly the fixed 15-book allowlist.
- Import requires non-empty approved permission reference and attribution values before any source fetch.
- Canonical book content is stored in PostgreSQL; user offline copies remain in user-scoped IndexedDB.
- A partially imported or failed version must never appear in the reader API.
- Do not activate the portal card until the 15-book import and offline Playwright acceptance pass.
- Do not refactor unrelated Union or portal code.
- Do not commit, deploy, or activate production without an explicit user request at the relevant checkpoint.

---

### Task 1: Baseline and preserve existing work

**Files:**
- Inspect: all paths reported by `git status --short`
- Modify: none

**Interfaces:**
- Consumes: the current uncommitted filesystem-backed reader implementation.
- Produces: reproducible baseline results and a precise list of pre-existing failures.

- [ ] **Step 1: Record the working-tree baseline**

Run:

```powershell
git status --short
git diff --stat
git diff --cached --stat
```

Expected: the current Gitabase implementation, offline additions, and deployment edits are visible; no cleanup or reset is performed.

- [ ] **Step 2: Run the focused existing tests**

```powershell
pnpm --filter @vedamatch/shared lint
pnpm --filter @vedamatch/gitabase-importer test
pnpm --filter @vedamatch/api exec jest --runInBand gitabase
pnpm --filter @vedamatch/web test -- gitabase
```

Expected: capture all failures exactly. Failures caused by unfinished route/storage migration become work items in Tasks 2-7; unrelated failures are reported and left unchanged.

- [ ] **Step 3: Verify the current Prisma schema**

Run:

```powershell
pnpm --filter @vedamatch/api exec prisma validate
```

Expected: current schema validity is known before adding content tables.

### Task 2: Define Vedabase shared contracts and canonical naming

**Files:**
- Rename: `packages/shared/src/gitabase.ts` -> `packages/shared/src/vedabase.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/gitabase-importer/src/**/*.ts`
- Modify: `packages/gitabase-importer/test/**/*.spec.ts`
- Modify: `packages/gitabase-importer/package.json`
- Test: `packages/shared/src/vedabase.spec.ts`

**Interfaces:**
- Produces: `VedabaseBookManifest`, `VedabaseLibraryManifest`, `VedabaseChapter`, `VedabaseSearchDocument`, and import status contracts.
- Consumes: existing structural contracts and fixed book slugs without changing their serialized content semantics.

- [ ] **Step 1: Add a failing contract test**

Create a test asserting the public exports and serialized status values:

```ts
import {
  VEDABASE_BOOK_SLUGS,
  type VedabaseBookManifest,
  type VedabaseImportStatus,
} from "./index";

const status: VedabaseImportStatus = "staging";
const manifest = {} as VedabaseBookManifest;

if (VEDABASE_BOOK_SLUGS.length !== 15) throw new Error("Expected 15 books");
if (status !== "staging") throw new Error("Invalid import status");
void manifest;
```

- [ ] **Step 2: Run the contract check and observe failure**

Run: `pnpm --filter @vedamatch/shared lint`

Expected: FAIL because the Vedabase exports do not exist.

- [ ] **Step 3: Rename TypeScript contracts without changing wire fields**

Define:

```ts
export type VedabaseImportStatus =
  | "staging"
  | "validated"
  | "active"
  | "failed";

export interface VedabaseSearchDocument {
  locator: VedabaseLocator;
  chapterSlug: string;
  title: string;
  text: string;
}
```

Rename `Gitabase*` TypeScript identifiers, user-visible errors, package name, environment-variable references, and source constants to `Vedabase*`/`VEDABASE_*`. Preserve the existing chapter JSON shape so the reader does not need a content rewrite.

- [ ] **Step 4: Keep a temporary source compatibility export**

During the migration only, export aliases needed by untouched files:

```ts
/** Remove after every consumer uses Vedabase names. */
export type GitabaseBookManifest = VedabaseBookManifest;
```

Remove these aliases in Task 7 after all imports are migrated.

- [ ] **Step 5: Verify shared and importer type checks**

```powershell
pnpm --filter @vedamatch/shared lint
pnpm --filter @vedamatch/vedabase-importer lint
```

Expected: PASS with exactly 15 fixed slugs.

### Task 3: Add immutable PostgreSQL content models

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260711_vedabase_postgres_content/migration.sql`
- Test: `apps/api/src/modules/vedabase/vedabase-content.repository.spec.ts`

**Interfaces:**
- Produces: Prisma models `VedabaseBook`, `VedabaseBookVersion`, `VedabaseChapter`, and `VedabaseSearchUnit`.
- Consumes: manifests and chapter payloads from Task 2.

- [ ] **Step 1: Write repository tests against mocked Prisma methods**

Cover these invariants:

```ts
it("returns only active versions", async () => {
  prisma.vedabaseBook.findMany.mockResolvedValue([]);
  await repository.listActiveBooks();
  expect(prisma.vedabaseBook.findMany).toHaveBeenCalledWith(
    expect.objectContaining({ where: { activeVersionId: { not: null } } }),
  );
});

it("activates only a validated version", async () => {
  prisma.vedabaseBookVersion.findUnique.mockResolvedValue({ status: "staging" });
  await expect(repository.activateVersion("version-id")).rejects.toThrow(
    "Vedabase version is not validated",
  );
});
```

- [ ] **Step 2: Add Prisma enums and models**

Use this relational shape:

```prisma
enum VedabaseImportStatus {
  staging
  validated
  active
  failed
}

model VedabaseBook {
  id              String                 @id @default(uuid())
  slug            String                 @unique
  title           String
  author          String?
  language        String
  cover           Json?
  sourceUrl       String
  attribution     String
  activeVersionId String?                @unique
  activeVersion   VedabaseBookVersion?   @relation("ActiveVedabaseVersion", fields: [activeVersionId], references: [id])
  versions        VedabaseBookVersion[]  @relation("VedabaseBookVersions")
  createdAt       DateTime               @default(now())
  updatedAt       DateTime               @updatedAt
}

model VedabaseBookVersion {
  id                 String                 @id @default(uuid())
  bookId             String
  book               VedabaseBook           @relation("VedabaseBookVersions", fields: [bookId], references: [id], onDelete: Cascade)
  activeFor          VedabaseBook?          @relation("ActiveVedabaseVersion")
  contentVersion     String
  formatVersion      Int
  status             VedabaseImportStatus   @default(staging)
  permissionRef      String
  attribution        String
  importedAt         DateTime
  sizeBytes          BigInt
  packageChecksum    String
  chapterCount       Int
  searchableUnitCount Int
  errorMessage       String?
  chapters           VedabaseChapter[]
  searchUnits        VedabaseSearchUnit[]
  createdAt          DateTime               @default(now())
  updatedAt          DateTime               @updatedAt

  @@unique([bookId, contentVersion])
  @@index([status, updatedAt])
}

model VedabaseChapter {
  id          String               @id @default(uuid())
  versionId   String
  version     VedabaseBookVersion  @relation(fields: [versionId], references: [id], onDelete: Cascade)
  slug        String
  title       String
  order       Int
  payload     Json
  bytes       Int
  sha256      String

  @@unique([versionId, slug])
  @@unique([versionId, order])
}

model VedabaseSearchUnit {
  id          String               @id @default(uuid())
  versionId   String
  version     VedabaseBookVersion  @relation(fields: [versionId], references: [id], onDelete: Cascade)
  chapterSlug String
  locator     Json
  title       String
  text        String

  @@index([versionId, chapterSlug])
}
```

Add a PostgreSQL GIN full-text index in migration SQL:

```sql
CREATE INDEX "VedabaseSearchUnit_text_fts_idx"
ON "VedabaseSearchUnit"
USING GIN (to_tsvector('russian', "text"));
```

- [ ] **Step 3: Generate Prisma client and validate schema**

```powershell
pnpm --filter @vedamatch/api exec prisma generate
pnpm --filter @vedamatch/api exec prisma validate
```

Expected: both commands exit `0`.

- [ ] **Step 4: Implement a focused content repository**

Create repository methods with exact signatures:

```ts
listActiveBooks(): Promise<VedabaseLibraryManifest>;
getActiveBook(bookSlug: string): Promise<VedabaseBookManifest>;
getActiveChapter(bookSlug: string, chapterSlug: string): Promise<VedabaseChapter>;
getOfflineSearchIndex(bookSlug: string): Promise<VedabaseSearchDocument[]>;
search(query: string, limit: number): Promise<VedabaseSearchResult[]>;
activateVersion(versionId: string): Promise<void>;
```

Activation must use a short `$transaction` that verifies `validated`, demotes the previous active version, promotes the target, and updates `activeVersionId`.

- [ ] **Step 5: Run repository tests**

Run: `pnpm --filter @vedamatch/api exec jest --runInBand vedabase-content.repository.spec.ts`

Expected: PASS.

### Task 4: Replace filesystem publication with resumable database import

**Files:**
- Replace: `packages/gitabase-importer/src/writer.ts` with `packages/gitabase-importer/src/database-writer.ts`
- Modify: `packages/gitabase-importer/src/import-book.ts`
- Modify: `packages/gitabase-importer/src/import-library.ts`
- Modify: `packages/gitabase-importer/src/cli.ts`
- Modify: `packages/gitabase-importer/package.json`
- Create: `packages/gitabase-importer/test/database-writer.spec.ts`
- Create: `packages/gitabase-importer/test/import-resume.spec.ts`

**Interfaces:**
- Produces: `DatabaseBookWriter.stage`, `writeChapterBatch`, `validate`, `activate`, and `fail`.
- Consumes: `DATABASE_URL`, parsed packages, permission reference, and attribution.

- [ ] **Step 1: Add failing writer lifecycle tests**

Test this exact lifecycle:

```ts
const version = await writer.stage(manifest);
await writer.writeChapterBatch(version.id, chapters);
await writer.writeSearchBatch(version.id, searchDocuments);
await writer.validate(version.id);
await writer.activate(version.id);
```

Assert that duplicate `(bookId, contentVersion)` resumes the existing `staging` version, already persisted chapter slugs are skipped, and active versions are immutable.

- [ ] **Step 2: Add Prisma client dependency and database option**

Add `@prisma/client` and use `DATABASE_URL`. Remove the requirement for `GITABASE_CONTENT_DIR`. CLI commands become:

```text
plan --book <slug>|--all
import --book <slug>|--all --resume --permission-ref <value> --attribution <value>
validate --book <slug>|--all
activate --book <slug>|--all
status
```

- [ ] **Step 3: Implement bounded batch writes**

Use batches of at most 100 chapters/search units per transaction. Persist chapter JSON, bytes, and checksum together. Never hold all 15 books in one database transaction.

- [ ] **Step 4: Validate from database reads**

Reconstruct the manifest/checksum input from stored rows, assert unique slugs/orders/locators, exact byte sizes and SHA-256 values, source origin, permission metadata, and expected counts. Only then update status to `validated`.

- [ ] **Step 5: Record failure and resume state**

On error, update only the staged version:

```ts
await prisma.vedabaseBookVersion.update({
  where: { id: versionId },
  data: { status: "failed", errorMessage: message.slice(0, 2000) },
});
```

`--resume` may resume `staging` or `failed` after clearing `errorMessage`; it must never mutate `active`.

- [ ] **Step 6: Run importer tests**

```powershell
pnpm --filter @vedamatch/vedabase-importer test
pnpm --filter @vedamatch/vedabase-importer lint
```

Expected: parser/package tests remain green; database lifecycle, batching, validation, and resume tests pass.

### Task 5: Serve PostgreSQL content through `/vedabase`

**Files:**
- Rename: `apps/api/src/modules/gitabase/` -> `apps/api/src/modules/vedabase/`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/modules/vedabase/vedabase-content.service.spec.ts`
- Test: `apps/api/src/modules/vedabase/vedabase-content.controller.spec.ts`
- Modify: `apps/api/test/app.e2e-spec.ts`

**Interfaces:**
- Produces: authenticated catalog, manifest, chapter, index, online search, and sync endpoints under `/vedabase`.
- Consumes: repository from Task 3 and existing user-state sync logic.

- [ ] **Step 1: Rewrite service tests for database reads**

Delete filesystem path traversal tests from the content service and replace them with active-version isolation, missing chapter, checksum/ETag, and search-limit tests.

- [ ] **Step 2: Replace file streaming controller routes**

Expose:

```ts
@Get("library")
getLibrary(): Promise<VedabaseLibraryManifest>;

@Get("books/:bookSlug")
getBook(@Param("bookSlug") slug: string): Promise<VedabaseBookManifest>;

@Get("books/:bookSlug/chapters/:chapterSlug")
getChapter(...): Promise<VedabaseChapter>;

@Get("books/:bookSlug/search-index")
getSearchIndex(...): Promise<VedabaseSearchDocument[]>;

@Get("search")
search(@Query("q") query: string, @Query("limit") limit?: string): Promise<VedabaseSearchResult[]>;
```

Set `ETag` to the stored SHA-256 for chapters. Reject blank search queries and cap limits at 100.

- [ ] **Step 3: Rename sync and user-state classes**

Rename TypeScript identifiers and route prefixes while preserving Prisma user-state data during this release. A separate destructive rename of existing user-state tables is not required; map renamed Prisma models to existing table names with `@@map` if necessary.

- [ ] **Step 4: Update API e2e tests**

Assert unauthenticated `/vedabase/library` returns `401`, authenticated catalog returns `200`, and no `staging`/`failed` version appears.

- [ ] **Step 5: Verify the API**

```powershell
pnpm --filter @vedamatch/api exec prisma validate
pnpm --filter @vedamatch/api exec jest --runInBand vedabase
pnpm --filter @vedamatch/api test:e2e -- --runInBand
pnpm --filter @vedamatch/api build
```

Expected: all commands exit `0`.

### Task 6: Move the web reader to `/vedabase` and keep offline downloads

**Files:**
- Rename: `apps/web/src/app/gitabase/` -> `apps/web/src/app/vedabase/`
- Rename: `apps/web/src/components/gitabase/` -> `apps/web/src/components/vedabase/`
- Rename: `apps/web/src/lib/gitabase/` -> `apps/web/src/lib/vedabase/`
- Rename: `apps/web/src/lib/gitabase-api.ts` -> `apps/web/src/lib/vedabase-api.ts`
- Rename: `apps/web/src/lib/gitabase-client-api.ts` -> `apps/web/src/lib/vedabase-client-api.ts`
- Modify: `apps/web/src/proxy.ts`
- Modify: `apps/web/src/components/logout-button.tsx`
- Modify: `apps/web/public/gitabase/sw.js`
- Rename: `apps/web/public/gitabase.webmanifest` -> `apps/web/public/vedabase.webmanifest`
- Create: `apps/web/src/app/gitabase/route.ts`

**Interfaces:**
- Produces: canonical `/vedabase` library and reader, permanent `/gitabase` redirect, API client using `/vedabase`, and IndexedDB database `vedabase:<userId>`.
- Consumes: Task 5 API without changing offline feature behavior.

- [ ] **Step 1: Add route and storage naming tests**

Assert:

```ts
expect(vedabaseLibraryUrl()).toBe("/vedabase");
expect(vedabaseDatabaseName("user-1")).toBe("vedabase:user-1");
expect(vedabaseApiUrl("/library")).toContain("/vedabase/library");
```

- [ ] **Step 2: Rename routes, imports, strings, storage, and PWA assets**

Update every public link, router call, API path, local database name, service-worker scope, cache prefix, manifest URL, and visible label from Gitabase to Vedabase. Do not change the established chapter payload shape.

- [ ] **Step 3: Implement the legacy redirect**

Return a permanent redirect without rendering personalized content:

```ts
import { redirect } from "next/navigation";

export function GET() {
  redirect("/vedabase");
}
```

- [ ] **Step 4: Keep offline storage integrity**

The download manager must fetch the book manifest, all chapters, cover assets, and search index; validate every checksum; and mark a version complete only after one IndexedDB transaction succeeds. Existing partial-download resume behavior remains covered by tests.

- [ ] **Step 5: Update logout cleanup**

Before redirecting, send `CLEAR_VEDABASE_CACHE`, delete `vedabase:<userId>`, and remove the active user pointer. Never delete another user's database.

- [ ] **Step 6: Run web verification**

```powershell
pnpm --filter @vedamatch/web lint
pnpm --filter @vedamatch/web test
pnpm --filter @vedamatch/web build
```

Expected: unit/component tests pass and the standalone build contains Vedabase manifest and service worker assets.

### Task 7: Update service activation, environment, and documentation

**Files:**
- Modify: `apps/api/prisma/seed.ts`
- Modify: `apps/api/prisma/seed.cjs`
- Modify: `.env.example`
- Modify: `docker-compose.yml`
- Modify: `portal/docker-compose.dokploy.yml`
- Replace: `docs/gitabase-import.md` -> `docs/vedabase-import.md`
- Replace: `docs/gitabase-deployment.md` -> `docs/vedabase-deployment.md`
- Modify: `README.md`

**Interfaces:**
- Produces: a `coming_soon` Vedabase card at `/vedabase`, database-only deployment configuration, and exact operator commands.
- Consumes: Tasks 3-6.

- [ ] **Step 1: Remove filesystem content configuration**

Remove `GITABASE_CONTENT_DIR`, `GITABASE_CONTENT_HOST_DIR`, and `/var/lib/vedamatch/gitabase` mounts. Add only importer operational variables:

```dotenv
VEDABASE_SOURCE_PERMISSION_REF=
VEDABASE_SOURCE_ATTRIBUTION=
VEDABASE_CACHE_DIR=.vedabase-cache
```

The importer and API use the existing `DATABASE_URL`.

- [ ] **Step 2: Update both seed implementations**

Before acceptance use:

```ts
{
  slug: "vedabase",
  name: "Vedabase",
  url: "/vedabase",
  status: "coming_soon",
}
```

Do not mark it active in this task.

- [ ] **Step 3: Rewrite import documentation for PostgreSQL**

Document exact plan/import/status/validate/activate commands, required rights variables, resume behavior, database backups, and rollback to a previous active version ID.

- [ ] **Step 4: Remove compatibility aliases**

Run `rg -n "Gitabase|gitabase|GITABASE" apps packages docs .env.example docker-compose.yml portal/docker-compose.dokploy.yml`. The only allowed remaining occurrence is the documented legacy `/gitabase` redirect and historical approved spec/plan files.

- [ ] **Step 5: Validate Compose configuration**

Run:

```powershell
docker compose config --quiet
docker compose -f portal/docker-compose.dokploy.yml config --quiet
```

Expected: both exit `0` without content-volume variables.

### Task 8: Import, validate, and inspect book content

**Files:**
- Modify: PostgreSQL data only
- Produce: operator acceptance record outside source control unless explicitly requested

**Interfaces:**
- Produces: exactly 15 validated active Vedabase books in PostgreSQL.
- Consumes: approved `VEDABASE_SOURCE_PERMISSION_REF` and `VEDABASE_SOURCE_ATTRIBUTION` supplied by the product owner.

- [ ] **Step 1: Confirm rights values before network access**

```powershell
if ([string]::IsNullOrWhiteSpace($env:VEDABASE_SOURCE_PERMISSION_REF)) { throw "VEDABASE_SOURCE_PERMISSION_REF is required" }
if ([string]::IsNullOrWhiteSpace($env:VEDABASE_SOURCE_ATTRIBUTION)) { throw "VEDABASE_SOURCE_ATTRIBUTION is required" }
```

Expected: stop without fetching if either value is absent.

- [ ] **Step 2: Back up the target database**

Use the configured production backup mechanism and record the backup identifier. Do not begin the full import until the backup completes successfully.

- [ ] **Step 3: Plan and import one small book**

```powershell
pnpm --filter @vedamatch/vedabase-importer import -- plan --book bhagavad-gita
pnpm --filter @vedamatch/vedabase-importer import -- import --book bhagavad-gita --resume --permission-ref "$env:VEDABASE_SOURCE_PERMISSION_REF" --attribution "$env:VEDABASE_SOURCE_ATTRIBUTION"
pnpm --filter @vedamatch/vedabase-importer import -- validate --book bhagavad-gita
```

Expected: one validated inactive/staging release is available for inspection.

- [ ] **Step 4: Inspect five random chapters**

Compare five database chapter payloads against their canonical source URLs. Confirm title, ordering, verse/prose sections, absence of `#next-contents`, sanitized HTML, source URL, permission reference, and attribution.

- [ ] **Step 5: Activate and smoke-test the staging book**

Run the activation command, request `/vedabase/library`, open its first chapter online, download it, disable networking, reload, and navigate to another downloaded chapter.

- [ ] **Step 6: Import and validate all 15 books**

```powershell
pnpm --filter @vedamatch/vedabase-importer import -- import --all --resume --permission-ref "$env:VEDABASE_SOURCE_PERMISSION_REF" --attribution "$env:VEDABASE_SOURCE_ATTRIBUTION"
pnpm --filter @vedamatch/vedabase-importer import -- validate --all
pnpm --filter @vedamatch/vedabase-importer import -- status
```

Expected: exactly 15 validated versions; zero duplicate slug/order/locator, checksum, size, permission, or source-origin errors.

- [ ] **Step 7: Activate the validated catalog**

Run: `pnpm --filter @vedamatch/vedabase-importer import -- activate --all`

Expected: `/vedabase/library` returns exactly 15 active books and no staged/failed content.

### Task 9: Automated offline acceptance and activation

**Files:**
- Rename/modify: `apps/web/e2e/gitabase-offline.spec.ts` -> `apps/web/e2e/vedabase-offline.spec.ts`
- Modify: `apps/web/playwright.config.ts`
- Modify: `apps/web/e2e/auth-state.ts`
- Modify after acceptance: `apps/api/prisma/seed.ts`
- Modify after acceptance: `apps/api/prisma/seed.cjs`

**Interfaces:**
- Produces: reproducible evidence that a PostgreSQL-backed book is downloadable and readable offline.
- Consumes: running web/API/PostgreSQL, 15 active books, `TEST_ACCESS_TOKEN`, and `TEST_USER_ID`.

- [ ] **Step 1: Complete the Playwright offline scenario**

Automate: authenticate, open `/vedabase`, download the smallest book, open a chapter, add progress/bookmark/note/highlight, search locally, disable network, reload the reader, navigate and search again, reconnect, wait for synchronized status, open a second context, and verify user state.

- [ ] **Step 2: Run the complete focused verification**

```powershell
pnpm --filter @vedamatch/shared lint
pnpm --filter @vedamatch/vedabase-importer test
pnpm --filter @vedamatch/vedabase-importer lint
pnpm --filter @vedamatch/api exec prisma validate
pnpm --filter @vedamatch/api exec jest --runInBand
pnpm --filter @vedamatch/api test:e2e -- --runInBand
pnpm --filter @vedamatch/api build
pnpm --filter @vedamatch/web lint
pnpm --filter @vedamatch/web test
pnpm --filter @vedamatch/web build
```

Expected: every command exits `0`.

- [ ] **Step 3: Run browser acceptance**

```powershell
pnpm --filter @vedamatch/web exec playwright install chromium
pnpm --filter @vedamatch/web test:e2e
```

Expected: Vedabase offline/sync scenario passes in Chromium.

- [ ] **Step 4: Activate the portal card only after acceptance**

Change both seeds from `coming_soon` to `active`, run `pnpm --filter @vedamatch/api seed`, and verify the authenticated `/services` response contains:

```json
{ "slug": "vedabase", "url": "/vedabase", "status": "active" }
```

- [ ] **Step 5: Review final scope**

```powershell
git diff --check
git status --short
rg -n "GITABASE_CONTENT_DIR|GITABASE_CONTENT_HOST_DIR" .
```

Expected: no whitespace errors, no filesystem content configuration, and only Vedabase/shared/deployment/spec/plan files changed beyond the pre-existing approved work. Do not commit or deploy without explicit approval.
