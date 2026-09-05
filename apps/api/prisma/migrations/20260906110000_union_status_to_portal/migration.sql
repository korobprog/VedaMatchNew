-- Статус переезжает из анкеты Знакомств в портальный профиль.
--
-- До этого «короткий статус» был полем `UnionProfile` и показывался только в
-- Знакомствах. Тем же путём уже прошли рассказ о себе и языки: человек один,
-- и держать разные подписи по сервисам он не подписывался.
--
-- Переносим до удаления колонки и только туда, где портальный статус ещё
-- пуст: если человек успел заполнить его в профиле, это его более свежее
-- решение, и затирать его старым значением анкеты нельзя.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md.

UPDATE "public"."User" u
SET "statusLine" = p."status"
FROM "public"."UnionProfile" p
WHERE p."userId" = u."id"
  AND p."status" IS NOT NULL
  AND btrim(p."status") <> ''
  AND u."statusLine" IS NULL;

ALTER TABLE "public"."UnionProfile" DROP COLUMN "status";
