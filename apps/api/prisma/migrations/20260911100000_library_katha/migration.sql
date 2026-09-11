-- Катха: материал, чей текст хранится на портале целиком, а не по ссылке.
-- Лекция, беседа, глава — то, что читают прямо на странице материала.

-- Новое значение нигде в этой миграции не используется: употребить его в той
-- же транзакции, где оно появилось, Postgres не даёт.
ALTER TYPE "public"."LibraryEntryType" ADD VALUE IF NOT EXISTS 'katha';

ALTER TABLE "LibraryEntry" ADD COLUMN "body" TEXT;

-- Материал должен на что-то указывать: на адрес, на источник или на
-- собственный текст. Прежнее ограничение знало только первые два.
ALTER TABLE "LibraryEntry" DROP CONSTRAINT "LibraryEntry_url_or_source";
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_url_source_or_body"
  CHECK ("url" IS NOT NULL OR "source" IS NOT NULL OR "body" IS NOT NULL);

-- Поиск находит катху и по её тексту. Выражение generated-колонки в
-- Postgres 16 на месте не меняется, поэтому колонка и индекс пересоздаются.
--
-- Веса: название с описанием — A, текст — D. Без них лекция, где слово
-- встречается сотню раз, обходила бы в выдаче материал с этим словом в
-- названии.
--
-- В вектор идут первые 100 000 знаков текста — это около 16 тысяч слов.
-- Дальше позиции слов в tsvector всё равно сливаются в одну (предел 16 383),
-- а размер вектора ограничен мегабайтом.
DROP INDEX "LibraryEntry_searchVector_idx";
ALTER TABLE "LibraryEntry" DROP COLUMN "searchVector";
ALTER TABLE "LibraryEntry"
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('russian', coalesce("titleRu", '') || ' ' || coalesce("descriptionRu", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("titleEn", '') || ' ' || coalesce("descriptionEn", '')), 'A') ||
    setweight(
      to_tsvector(
        CASE WHEN "contentLanguage" = 'en' THEN 'english'::regconfig ELSE 'russian'::regconfig END,
        left(coalesce("body", ''), 100000)
      ),
      'D'
    )
  ) STORED;

CREATE INDEX "LibraryEntry_searchVector_idx" ON "LibraryEntry" USING GIN ("searchVector");
