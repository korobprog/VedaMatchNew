-- VED-430: тематический раздел задачи отдельно от статуса.
-- VED-421: время последней правки для вида «По правке».
-- Обе колонки nullable, существующие строки ничего не теряют.

ALTER TABLE "WorkTask" ADD COLUMN "editedAt" TIMESTAMP(3),
ADD COLUMN "sectionColumnId" TEXT;

CREATE INDEX "WorkTask_sectionColumnId_idx" ON "WorkTask"("sectionColumnId");

ALTER TABLE "WorkTask" ADD CONSTRAINT "WorkTask_sectionColumnId_fkey" FOREIGN KEY ("sectionColumnId") REFERENCES "WorkColumn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Колонка статуса — та, чьё название разбирается в один из четырёх статусов
-- (work-task-status.ts, MARK_BY_COLUMN). Нормализация та же: регистр, ё→е,
-- кавычки и лишние пробелы не в счёт. Список скопирован намеренно: миграция
-- разовая и не должна меняться вместе с кодом. Без временных таблиц: каждый
-- запрос несёт свой CTE и не зависит от того, в транзакции ли идёт скрипт.

-- 1. Раздел задач, стоящих в колонке раздела, — сама колонка.
WITH status_columns AS (
  SELECT c."id" FROM "WorkColumn" c
  WHERE btrim(regexp_replace(
          regexp_replace(replace(lower(c."name"), 'ё', 'е'), '[«»"''`]', '', 'g'),
          '\s+', ' ', 'g')) IN (
    'в работе', 'в работу', 'в процессе', 'делается',
    'тестирование', 'тестерование', 'на тестировании', 'на тестеровании',
    'тест', 'на проверке', 'проверка',
    'выполнено', 'готово', 'сделано', 'завершено', 'закрыто',
    'на доработку', 'доработка', 'на доработке', 'вернули', 'возврат')
)
UPDATE "WorkTask" t
SET "sectionColumnId" = t."columnId"
WHERE t."columnId" NOT IN (SELECT "id" FROM status_columns);

-- 2. Задачи в колонке статуса: раздел — последняя колонка раздела, из
--    которой их переносили (журнал WorkActivity, payload.from). Задача,
--    заведённая прямо в колонке статуса, остаётся без раздела.
WITH status_columns AS (
  SELECT c."id" FROM "WorkColumn" c
  WHERE btrim(regexp_replace(
          regexp_replace(replace(lower(c."name"), 'ё', 'е'), '[«»"''`]', '', 'g'),
          '\s+', ' ', 'g')) IN (
    'в работе', 'в работу', 'в процессе', 'делается',
    'тестирование', 'тестерование', 'на тестировании', 'на тестеровании',
    'тест', 'на проверке', 'проверка',
    'выполнено', 'готово', 'сделано', 'завершено', 'закрыто',
    'на доработку', 'доработка', 'на доработке', 'вернули', 'возврат')
),
last_section AS (
  SELECT DISTINCT ON (a."taskId") a."taskId", c."id" AS "fromId"
  FROM "WorkActivity" a
  JOIN "WorkTask" task ON task."id" = a."taskId"
  JOIN "WorkColumn" c ON c."id" = a."payload"->>'from' AND c."boardId" = task."boardId"
  WHERE a."kind" IN ('task_moved', 'task_completed')
    AND c."id" NOT IN (SELECT "id" FROM status_columns)
  ORDER BY a."taskId", a."createdAt" DESC
)
UPDATE "WorkTask" t
SET "sectionColumnId" = last_section."fromId"
FROM last_section
WHERE t."id" = last_section."taskId"
  AND t."columnId" IN (SELECT "id" FROM status_columns);

-- 3. «По правке»: известное из журнала — создание и последнее действие.
--    `updatedAt` не берём: его двигали перенумерация колонки и флаг
--    «завершающая» на всю колонку, и задачи, которых никто не трогал,
--    всплыли бы наверх.
UPDATE "WorkTask" t
SET "editedAt" = GREATEST(t."createdAt", COALESCE(last."at", t."createdAt"))
FROM (
  SELECT a."taskId", MAX(a."createdAt") AS "at"
  FROM "WorkActivity" a
  WHERE a."taskId" IS NOT NULL
  GROUP BY a."taskId"
) last
WHERE t."id" = last."taskId";

UPDATE "WorkTask" SET "editedAt" = "createdAt" WHERE "editedAt" IS NULL;
