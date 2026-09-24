-- Раздел «Лекции» в Медиатеке (VED-437): тот же MusicAudiobook с отметкой раздела.
CREATE TYPE "MusicAudiobookKind" AS ENUM ('audiobook', 'lecture');

ALTER TABLE "MusicAudiobook" ADD COLUMN "kind" "MusicAudiobookKind" NOT NULL DEFAULT 'audiobook';

CREATE INDEX "MusicAudiobook_kind_isPublished_title_idx" ON "MusicAudiobook"("kind", "isPublished", "title");
