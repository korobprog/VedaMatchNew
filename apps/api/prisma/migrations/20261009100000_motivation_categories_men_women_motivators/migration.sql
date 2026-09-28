-- VED-636: категории «Мужчины и Женщины» и «Мотиваторы» для картинок и
-- открыток. Верхний уровень, лента `both` — стоят в выборе категории и у
-- картинок, и у открыток. Идемпотентно: если редакция уже завела раздел с
-- таким слагом или названием (без учёта регистра), второй не появится.
INSERT INTO "MotivationCategory" ("id", "slug", "title", "sortOrder", "isDefault", "feed", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  v."slug",
  v."title",
  COALESCE((SELECT MAX("sortOrder") FROM "MotivationCategory" WHERE "parentId" IS NULL), 0) + v."step",
  false,
  'both'::"MotivationCategoryFeed",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM (
  VALUES
    ('muzhchiny-i-zhenschiny', 'Мужчины и Женщины', 10),
    ('motivatory', 'Мотиваторы', 20)
) AS v("slug", "title", "step")
WHERE NOT EXISTS (
  SELECT 1 FROM "MotivationCategory" c
  WHERE c."slug" = v."slug" OR lower(c."title") = lower(v."title")
)
ON CONFLICT ("slug") DO NOTHING;
