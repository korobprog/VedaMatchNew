-- Духовная линия преданного и линия контента.
--
-- Справочник линий (ISKCON, Гаудия-матхи, паривары) живёт константой в
-- @vedamatch/shared, поэтому колонки — TEXT, а не enum: новая линия не
-- требует миграции. `User.lineage` — портальное поле, в московский контур не
-- уходит (не идентифицирует человека, см. personal-fields.ts).
--
-- У материалов и записей умолчание ISKCON: каталог наполнялся в его
-- контексте, и существующие строки получают его через DEFAULT. NULL означает
-- «для всех линий» и ставится только явно.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md.

ALTER TABLE "public"."User" ADD COLUMN "lineage" TEXT;

ALTER TABLE "public"."LibraryEntry" ADD COLUMN "lineage" TEXT DEFAULT 'iskcon';
CREATE INDEX "LibraryEntry_lineage_status_publishedAt_idx"
  ON "public"."LibraryEntry"("lineage", "status", "publishedAt" DESC);

ALTER TABLE "public"."LibraryPreference" ADD COLUMN "lineage" TEXT;

ALTER TABLE "public"."MusicTrack" ADD COLUMN "lineage" TEXT DEFAULT 'iskcon';
CREATE INDEX "MusicTrack_lineage_status_publishedAt_idx"
  ON "public"."MusicTrack"("lineage", "status", "publishedAt" DESC);

ALTER TABLE "public"."MusicSettings" ADD COLUMN "lineage" TEXT;

ALTER TABLE "public"."MusicIngestBatch" ADD COLUMN "lineage" TEXT DEFAULT 'iskcon';
