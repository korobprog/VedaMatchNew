-- VED-237 → VED-297: аудиокнига — самостоятельная единица раздела
-- «Аудиокниги» (своё название, обложка, автор, чтец, главы по порядку), а не
-- карточка чтеца. Заказчик 22.09: «Безусловно каждая аудиокнига должна быть
-- самостоятельной единицей».
--
-- Миграция аддитивная: две новые таблицы, существующие не меняются.
-- Написано руками, а не сгенерировано (см. CLAUDE.md).

-- CreateTable
CREATE TABLE "public"."MusicAudiobook" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "readerId" TEXT,
    "description" TEXT,
    "coverKey" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicAudiobook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicAudiobookChapter" (
    "id" TEXT NOT NULL,
    "audiobookId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicAudiobookChapter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MusicAudiobook_slug_key" ON "public"."MusicAudiobook"("slug");

-- CreateIndex
CREATE INDEX "MusicAudiobook_readerId_idx" ON "public"."MusicAudiobook"("readerId");

-- CreateIndex
CREATE INDEX "MusicAudiobook_isPublished_title_idx" ON "public"."MusicAudiobook"("isPublished", "title");

-- CreateIndex
CREATE UNIQUE INDEX "MusicAudiobookChapter_trackId_key" ON "public"."MusicAudiobookChapter"("trackId");

-- CreateIndex
CREATE INDEX "MusicAudiobookChapter_audiobookId_position_idx" ON "public"."MusicAudiobookChapter"("audiobookId", "position");

-- AddForeignKey
ALTER TABLE "public"."MusicAudiobook" ADD CONSTRAINT "MusicAudiobook_readerId_fkey" FOREIGN KEY ("readerId") REFERENCES "public"."MusicArtist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicAudiobookChapter" ADD CONSTRAINT "MusicAudiobookChapter_audiobookId_fkey" FOREIGN KEY ("audiobookId") REFERENCES "public"."MusicAudiobook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicAudiobookChapter" ADD CONSTRAINT "MusicAudiobookChapter_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Перенос того, что уже размечено по схеме PR #417. Там книгой была карточка
-- чтеца (`MusicArtist.isAudiobook`), главами — все его записи. Каждый такой
-- чтец с записями становится одной опубликованной книгой: название — имя
-- чтеца, чтец — он сам, главы — все его записи. Так раздел после выката
-- показывает ровно то же, что показывал до него, а разложить главы по
-- разным книгам редакция может уже в админке.
--
-- Слаг книги — слаг исполнителя: он уникален среди исполнителей, а таблица
-- книг до этой минуты пуста, так что конфликтов нет.
INSERT INTO "public"."MusicAudiobook" ("id", "slug", "title", "readerId", "isPublished", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, a."slug", a."name", a."id", true, now(), now()
FROM "public"."MusicArtist" a
WHERE a."isAudiobook" = true
  AND EXISTS (SELECT 1 FROM "public"."MusicTrack" t WHERE t."artistId" = a."id");

-- Порядок глав: номер дорожки из тегов, если запись пришла пополнением;
-- затем первое число в названии («Глава 2» раньше «Глава 10» — по алфавиту
-- было бы наоборот; не больше девяти цифр, чтобы дата в названии не
-- переполнила int); затем название и время заливки.
INSERT INTO "public"."MusicAudiobookChapter" ("id", "audiobookId", "trackId", "position", "createdAt")
SELECT
  gen_random_uuid()::text,
  b."id",
  t."id",
  (row_number() OVER (
    PARTITION BY b."id"
    ORDER BY
      ii."trackNumber" NULLS LAST,
      (substring(t."title" from '[0-9]{1,9}'))::int NULLS LAST,
      t."title",
      t."createdAt",
      t."id"
  ))::int,
  now()
FROM "public"."MusicAudiobook" b
JOIN "public"."MusicTrack" t ON t."artistId" = b."readerId"
LEFT JOIN "public"."MusicIngestItem" ii ON ii."trackId" = t."id";
