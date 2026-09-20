-- VED-237: раздел «Аудиокниги» в Медиатеке. Отметка стоит у исполнителя-
-- чтеца, а не у каждой записи: редакция размечает его один раз, и каждая
-- новая глава попадает в раздел сама — тем же приёмом, что корневая
-- категория (VED-165-2). Колонка аддитивная, со значением по умолчанию:
-- весь существующий каталог остаётся обычной Медиатекой.
-- Написано руками, а не сгенерировано (см. CLAUDE.md).

-- AlterTable
ALTER TABLE "public"."MusicArtist" ADD COLUMN "isAudiobook" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "MusicArtist_isAudiobook_idx" ON "public"."MusicArtist"("isAudiobook");
