-- Признак резидентности данных. Заводится до российского контура: без него
-- нечего маршрутизировать, а у входа по почте признак невосстановим задним
-- числом — правило смотрит на домен регистрации, а его никто не помнит.

-- CreateEnum
CREATE TYPE "DataResidency" AS ENUM ('ru', 'global');

-- Колонка добавляется необязательной, заполняется, затем становится
-- обязательной: иначе NOT NULL упадёт на существующих строках.
ALTER TABLE "User" ADD COLUMN "dataResidency" "DataResidency";

-- Признак берётся у САМОЙ РАННЕЙ идентичности, а не у любой: после привязки
-- второго способа у человека будет и google, и yandex, и выбор «любой»
-- разложил бы признак случайно.
UPDATE "User" u
SET "dataResidency" = CASE
  WHEN first.provider IN ('yandex', 'vk') THEN 'ru'::"DataResidency"
  ELSE 'global'::"DataResidency"
END
FROM (
  SELECT DISTINCT ON ("userId") "userId", provider
  FROM "UserIdentity"
  ORDER BY "userId", "createdAt" ASC, id ASC
) AS first
WHERE first."userId" = u.id;

-- Аккаунты без идентичностей: дев-вход по паролю и демо-сид.
UPDATE "User" SET "dataResidency" = 'global' WHERE "dataResidency" IS NULL;

ALTER TABLE "User" ALTER COLUMN "dataResidency" SET NOT NULL;
