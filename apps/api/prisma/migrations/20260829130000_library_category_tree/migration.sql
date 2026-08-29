-- Разделы и категории справочника схлопываются в одно дерево LibraryCategory.
--
-- Разделы переносятся строками с parentId = NULL и СВОИМИ ЖЕ id, поэтому
-- существующий LibraryCategory."sectionId" превращается в "parentId" простым
-- переименованием колонки — таблица соответствий не нужна.

-- 1. Новые поля дерева.
ALTER TABLE "LibraryCategory"
  ADD COLUMN "path" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "iconKey" TEXT;

-- 2. Слаг был уникален лишь внутри раздела. Перед глобальным ограничением
--    разводим совпадения — и между категориями, и с будущими корнями.
UPDATE "LibraryCategory" AS c
SET "slug" = c."slug" || '-' || substr(replace(c."id"::text, '-', ''), 1, 6)
WHERE EXISTS (
  SELECT 1 FROM "LibraryCategory" AS other
  WHERE other."slug" = c."slug" AND other."id" <> c."id"
) OR EXISTS (
  SELECT 1 FROM "LibrarySection" AS s WHERE s."slug" = c."slug"
);

-- 3. sectionId становится parentId: FK на себя, NULL разрешён.
ALTER TABLE "LibraryCategory" DROP CONSTRAINT "LibraryCategory_sectionId_fkey";
DROP INDEX "LibraryCategory_sectionId_slug_key";
DROP INDEX "LibraryCategory_sectionId_status_idx";
ALTER TABLE "LibraryCategory" RENAME COLUMN "sectionId" TO "parentId";
ALTER TABLE "LibraryCategory" ALTER COLUMN "parentId" DROP NOT NULL;

-- 4. Разделы въезжают корнями. titleRu/titleEn у категории необязательны,
--    у раздела были обязательными — сужения типа не происходит.
INSERT INTO "LibraryCategory" (
  "id", "parentId", "slug", "titleRu", "titleEn",
  "descriptionRu", "descriptionEn", "normalizedRu", "normalizedEn",
  "iconKey", "position", "path", "status", "entriesCount",
  "createdAt", "updatedAt"
)
SELECT
  s."id", NULL, s."slug", s."titleRu", s."titleEn",
  s."descriptionRu", s."descriptionEn", '', '',
  s."iconKey", s."position", '', 'active', 0,
  s."createdAt", s."updatedAt"
FROM "LibrarySection" AS s;

-- 5. Путь предков: у корня пустой, у ребёнка — `.<id родителя>.`.
--    Глубина на момент миграции ровно два уровня, рекурсия не нужна.
UPDATE "LibraryCategory"
SET "path" = '.' || "parentId" || '.'
WHERE "parentId" IS NOT NULL;

-- 6. Порядок среди соседей: сохраняем прежнюю сортировку категорий
--    (по числу материалов, затем по дате) как стартовую раскладку.
WITH ordered AS (
  SELECT "id", ROW_NUMBER() OVER (
    PARTITION BY "parentId" ORDER BY "entriesCount" DESC, "createdAt" ASC
  ) - 1 AS "pos"
  FROM "LibraryCategory"
  WHERE "parentId" IS NOT NULL
)
UPDATE "LibraryCategory" AS c
SET "position" = ordered."pos"
FROM ordered
WHERE c."id" = ordered."id";

-- 7. Нормализованные названия у приехавших корней: раньше разделы не
--    участвовали в поиске похожих рубрик, теперь это те же категории, и без
--    заполненного поля дубль корня не был бы найден. Повторяем правило
--    normalizeTitle() из category-slug.ts; при любой правке рубрики сервис
--    пересчитает поле сам.
UPDATE "LibraryCategory"
SET
  "normalizedRu" = btrim(regexp_replace(
    regexp_replace(lower(COALESCE("titleRu", '')), '[^[:alnum:][:space:]]', ' ', 'g'),
    '\s+', ' ', 'g')),
  "normalizedEn" = btrim(regexp_replace(
    regexp_replace(lower(COALESCE("titleEn", '')), '[^[:alnum:][:space:]]', ' ', 'g'),
    '\s+', ' ', 'g'))
WHERE "parentId" IS NULL;

-- 8. Ограничения и индексы дерева.
ALTER TABLE "LibraryCategory"
  ADD CONSTRAINT "LibraryCategory_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "LibraryCategory"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LibraryCategory_slug_key" ON "LibraryCategory"("slug");
CREATE INDEX "LibraryCategory_parentId_position_idx" ON "LibraryCategory"("parentId", "position");
CREATE INDEX "LibraryCategory_path_idx" ON "LibraryCategory"("path");

DROP TABLE "LibrarySection";
