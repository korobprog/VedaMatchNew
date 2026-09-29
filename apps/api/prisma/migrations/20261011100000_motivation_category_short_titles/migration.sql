-- VED-646: короткие названия категорий Вдохновения — «Стихи Вед» → «Веды»,
-- «Другие религии» → «Религии». Слаги не меняются: ссылки и фильтры живут.
-- Только если такого названия ещё нет (редакция могла переименовать сама).
UPDATE "MotivationCategory" c
SET "title" = v."to", "updatedAt" = CURRENT_TIMESTAMP
FROM (VALUES ('Стихи Вед', 'Веды'), ('Другие религии', 'Религии')) AS v("from", "to")
WHERE c."title" = v."from"
  AND NOT EXISTS (
    SELECT 1 FROM "MotivationCategory" o
    WHERE o."title" = v."to"
      AND o."parentId" IS NOT DISTINCT FROM c."parentId"
  );
