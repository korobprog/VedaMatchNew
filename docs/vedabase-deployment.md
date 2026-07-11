# Vedabase deployment

The API and importer use the existing `DATABASE_URL`. Vedabase content volumes and `VEDABASE_CONTENT_DIR` are not supported.

## Release procedure

1. Confirm approved permission and attribution values.
2. Complete and record a PostgreSQL backup.
3. Import and validate one book, inspect its stored chapters, then activate it.
4. Import, validate, and activate all 15 books.
5. Verify `/vedabase/library` contains exactly 15 active books.
6. Run the online/offline Playwright acceptance before changing the portal card from `coming_soon` to `active`.

## Rollback

Record the previous active `VedabaseBookVersion.id` before activation. To roll back, validate the target historical version, activate that version ID transactionally, and verify the catalog and a chapter. Restore the database backup only if version activation cannot recover the service.

## Browser offline data

Downloaded books are stored per user in IndexedDB as `vedabase:<userId>`. Logout clears the Vedabase shell cache, deletes only the active user's database, and removes the active-user pointer.
