# VedaMatch Vedabase PostgreSQL Offline Reader Design

## Goal

Deliver an authenticated book reader at `https://vedamatch.ru/vedabase` containing the 15 approved books imported from `https://vedabase.ru/`. Canonical book content lives in PostgreSQL. Users can download individual books or the full library into browser IndexedDB and continue reading, searching, bookmarking, highlighting, and taking notes without a network connection.

## Naming and routes

- The public product name is **Vedabase**.
- The canonical web route is `/vedabase`.
- All new API routes use the `/vedabase` prefix.
- Existing `/gitabase` web links redirect permanently to `/vedabase` during the migration period.
- Internal Gitabase names are renamed where practical so application code, database models, environment variables, documentation, and user-facing text use one vocabulary.

## Architecture

The content flow is:

```text
vedabase.ru -> resumable importer -> PostgreSQL -> authenticated API -> browser IndexedDB -> offline reader
```

The existing importer remains responsible for source discovery, rate-limited fetching, HTML sanitization, stable locators, attribution, checksums, and package validation. Its publication target changes from a filesystem content directory to PostgreSQL.

The API reads book metadata and chapter content from PostgreSQL. The web application reads online through the API and writes complete downloaded books to a user-scoped IndexedDB database. Offline navigation never depends on cached personalized HTML responses.

## PostgreSQL content model

### Book

One stable record per source book:

- stable slug;
- title, author, language, cover metadata, source URL, and attribution;
- active version identifier;
- availability status.

### Book version

Every successful import creates an immutable version containing:

- content version and format version;
- source permission reference and attribution;
- source/import timestamps;
- aggregate byte size and SHA-256 checksum;
- import status: `staging`, `validated`, `active`, or `failed`;
- chapter and searchable-unit counts.

Only one validated version can be active for a book. Previous active versions remain available until clients can safely move to the replacement.

### Chapter

Chapter metadata is normalized into rows for ordering and navigation. Each chapter stores its structured reader payload in `JSONB`, including stable text locators, available source sections, sanitized markup, and source URLs. Chapter rows also store byte size and SHA-256 for download verification.

### Search document

Searchable units are stored per chapter with stable locators and normalized text. PostgreSQL full-text search supports online search. The API also exposes a compact per-book search index that is stored with the downloaded book in IndexedDB for offline search.

The book version also stores byte size and SHA-256 metadata for the serialized offline search index and cover payload. This preserves end-to-end download verification without filesystem package files.

## Import and publication

The importer uses the fixed 15-book allowlist and requires approved permission-reference and attribution values before the first network request.

For each book it:

1. creates or resumes a `staging` book version;
2. fetches and caches source pages with bounded concurrency, retries, and rate limiting;
3. parses only canonical content and removes unsafe or unrelated markup;
4. writes chapters and search documents in bounded database batches;
5. validates counts, source origins, locators, byte sizes, and checksums from database reads;
6. marks the version `validated`;
7. atomically switches the book's active version and marks it `active`.

An interrupted import is invisible to readers and can resume without duplicating chapters. A failed validation marks the staged version `failed` and leaves the previous active version unchanged.

## API

All routes use the existing authentication guard.

- `GET /vedabase/library` returns active books, versions, sizes, covers, and download metadata.
- `GET /vedabase/books/:bookSlug` returns the active book manifest and ordered table of contents.
- `GET /vedabase/books/:bookSlug/chapters/:chapterSlug` returns one structured chapter with checksum headers.
- `GET /vedabase/books/:bookSlug/search-index` returns the compact offline index.
- `GET /vedabase/books/:bookSlug/cover` returns the active cover payload when present.
- `GET /vedabase/search` performs authenticated PostgreSQL full-text search.
- `/vedabase/sync` endpoints synchronize progress, bookmarks, notes, and highlights using the existing conflict protocol.

Content responses include immutable version identifiers, `ETag`, content length where applicable, and checksums. Requests for missing, inactive, or partially imported versions return explicit `404` or `409` responses rather than partial content.

## Web and offline behavior

The library page at `/vedabase` displays all active books and their download state. Users can read online, download one book, resume an interrupted download, remove a local book, or download the complete library.

A downloaded book contains its manifest, ordered chapter payloads, cover assets required by the reader, and compact search index. Download completion is recorded only after every item passes size and checksum validation.

Large books are written to IndexedDB in bounded transactions. A separate activation record is committed only after all required chapters, cover data, and search index validate, so partial versions remain invisible without one unsafe long-running transaction.

The reader loads the requested active version from IndexedDB when available and falls back to the API while online. When offline, it offers only downloaded books and chapters. The local reader supports table of contents, previous/next navigation, themes, font sizing, reading progress, bookmarks, highlights, notes, and full-text search across downloaded books.

IndexedDB databases are scoped by authenticated user ID. Logout removes the active user pointer, clears user-specific service-worker state, and deletes that user's local Vedabase database.

## Synchronization

Reading progress, bookmarks, notes, and highlights remain in PostgreSQL user-state tables and are mirrored locally. Local mutations enter an IndexedDB outbox. Reconnection pushes queued operations idempotently, then pulls changes newer than the local cursor. Conflicts use the existing deterministic last-write/tombstone rules.

Book content itself is not synchronized through the user-state protocol. The client compares catalog version identifiers and explicitly downloads a replacement version before deleting the older offline copy.

## Deployment

PostgreSQL replaces the planned read-only filesystem content volume. Deployment configuration supplies the existing database connection only; no `GITABASE_CONTENT_DIR` or content bind mount is required.

The Vedabase portal card remains `coming_soon` until:

1. database migrations succeed;
2. one-book staging import and inspection succeed;
3. all 15 books import and validate successfully;
4. API and web verification pass;
5. browser acceptance proves downloaded reading and search work with networking disabled.

After acceptance, both seed implementations set the card URL to `/vedabase` and status to `active`.

## Error handling and operations

- Import progress is recorded per book/version and is queryable without reading process logs.
- Import retries never overwrite an active version.
- Database writes use bounded batches to avoid long unbounded transactions and excessive memory use.
- Activation uses one short transaction after full validation.
- API health reporting includes database connectivity and active-book count without exposing content or credentials.
- Operational documentation covers starting, resuming, validating, activating, and rolling back an import.

## Testing and acceptance

Automated coverage includes:

- importer parsing, sanitization, resume, idempotency, database batching, validation, activation, and rollback behavior;
- Prisma schema validation and migration tests;
- API authorization, catalog, manifest, chapter, checksum, search, and incomplete-version behavior;
- IndexedDB storage, download resume, checksum rejection, offline search, and user isolation;
- reader UI behavior for online and offline chapters;
- Playwright acceptance: authenticate, download a small book, create reading state, disable networking, reload `/vedabase`, navigate chapters, search locally, reconnect, synchronize, and verify the state in a second browser context.

Release acceptance requires exactly 15 active books, no staging/failed version exposed through the library API, and a passing offline browser scenario.

## Scope boundaries

- The first release imports the approved fixed 15-book catalog only.
- Automatic scheduled re-import is out of scope.
- PostgreSQL stores canonical content; it does not store each user's offline copy.
- Native mobile packaging is out of scope; offline support targets the installed or regular browser web application.
- The change does not refactor unrelated Union or portal modules.
