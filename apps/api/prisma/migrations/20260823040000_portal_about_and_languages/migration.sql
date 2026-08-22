-- Рассказ о себе и языки становятся портальными.
--
-- Человек писал их дважды — в анкете Знакомств и в карточке справочника, — и
-- две копии расходились. Сервисам запрещено читать чужие таблицы, поэтому
-- общее место у них ровно одно: `User`, откуда оба и так берут имя, город и
-- фото.
ALTER TABLE "User"
  ADD COLUMN "about" TEXT,
  ADD COLUMN "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Переносим то, что уже написано. Если заполнено в обоих местах, берём
-- длинный текст: он несёт больше, а короткий человек всегда допишет.
UPDATE "User" u
SET "about" = COALESCE(
  NULLIF(
    (
      SELECT candidate
      FROM (
        SELECT up."about" AS candidate FROM "UnionProfile" up WHERE up."userId" = u."id"
        UNION ALL
        SELECT cp."about" FROM "ContactsProfile" cp WHERE cp."userId" = u."id"
      ) sources
      WHERE candidate IS NOT NULL AND btrim(candidate) <> ''
      ORDER BY length(candidate) DESC
      LIMIT 1
    ),
    ''
  ),
  u."about"
);

-- Языки объединяем: это перечисление, и потерять половину списка хуже, чем
-- показать на один язык больше, чем человек ожидал.
UPDATE "User" u
SET "languages" = COALESCE(
  (
    SELECT array_agg(DISTINCT btrim(language))
    FROM (
      SELECT unnest(up."languages") AS language FROM "UnionProfile" up WHERE up."userId" = u."id"
      UNION ALL
      SELECT unnest(cp."languages") FROM "ContactsProfile" cp WHERE cp."userId" = u."id"
    ) sources
    WHERE btrim(language) <> ''
  ),
  ARRAY[]::TEXT[]
);

-- Старые колонки остаются на один релиз: если перенос где-то ошибётся, данные
-- ещё на месте. Снос — отдельной миграцией, как со старым Union-чатом.
