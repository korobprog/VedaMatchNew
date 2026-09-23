-- Ветка новости у уведомления (VED-320): смена статуса задачи «Работы» лежит
-- в ленте одной строкой, которая обновляется и поднимается, а не копится.
ALTER TABLE "NotificationItem" ADD COLUMN "threadKey" TEXT;

-- Уже лежащие уведомления о смене статуса становятся ветками, иначе первая
-- смена после выката положила бы рядом со старой строкой вторую. Ключ тот же,
-- что собирает `workStatusThreadKey()`: 'work-status:' и адрес карточки.
--
-- Узнаём их по заголовкам всех версий: «VED-1: сменился статус» (сейчас),
-- «VED-1: «Колонка»» (до VED-320), «Задачу вернули» и «Задачу вернули в
-- работу». Комментарий («VED-1: новый комментарий») и поручение сюда не
-- попадают — это другие новости, и они остаются каждая своей строкой.
--
-- Ключ получает только самая свежая строка на человека и задачу: уникальность
-- пары не пустила бы две, а старые остаются в ленте как были — историей.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", "url"
      ORDER BY "createdAt" DESC, "id" DESC
    ) AS rn
  FROM "NotificationItem"
  WHERE "category" = 'work'
    AND "url" LIKE '/work/planner/%'
    AND (
      "title" LIKE '%: сменился статус'
      OR "title" ~ '^[A-Za-z0-9]+-[0-9]+: «.*»$'
      OR "title" IN ('Задачу вернули', 'Задачу вернули в работу')
    )
)
UPDATE "NotificationItem" AS n
SET "threadKey" = 'work-status:' || n."url"
FROM ranked
WHERE n."id" = ranked."id" AND ranked.rn = 1;

CREATE UNIQUE INDEX "NotificationItem_userId_threadKey_key" ON "NotificationItem"("userId", "threadKey");
