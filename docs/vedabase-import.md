# Vedabase PostgreSQL import

Vedabase imports the fixed 15-book allowlist from `https://vedabase.ru` into PostgreSQL. Canonical content is never published from a filesystem directory.

## Required environment

Set `DATABASE_URL`, `VEDABASE_SOURCE_PERMISSION_REF`, and `VEDABASE_SOURCE_ATTRIBUTION`. The optional `VEDABASE_CACHE_DIR` defaults to `.vedabase-cache`. The importer must stop before fetching when either rights value is blank.

## Commands

```powershell
pnpm --filter @vedamatch/vedabase-importer import -- plan --book bhagavad-gita
pnpm --filter @vedamatch/vedabase-importer import -- import --book bhagavad-gita --resume --permission-ref "$env:VEDABASE_SOURCE_PERMISSION_REF" --attribution "$env:VEDABASE_SOURCE_ATTRIBUTION"
pnpm --filter @vedamatch/vedabase-importer import -- validate --book bhagavad-gita
pnpm --filter @vedamatch/vedabase-importer import -- activate --book bhagavad-gita
pnpm --filter @vedamatch/vedabase-importer import -- status
```

Replace `--book bhagavad-gita` with `--all` for the complete catalog. `--resume` continues only staging or failed versions, skips verified chapters, and never mutates an active version.

Back up PostgreSQL before a full import or activation. Validate the staged version before activation; incomplete and failed versions are not visible through `/vedabase`.
