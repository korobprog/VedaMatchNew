-- VED-351: проставить пометку состояния уведомлениям, которые уже лежат в ленте.
--
-- Схему не трогаем — колонка `NotificationItem.mark` есть с VED-272. Это
-- разовая правка данных: пометка появилась позже самих уведомлений, и у всего,
-- что попало в ленту до неё, её просто нет. Заказчик читает ленту целиком и
-- справедливо говорит, что «зелёный значок» стоит только у двух свежих задач.
--
-- Дальше пометка живёт сама: с VED-320 «Работа» на каждой смене колонки шлёт
-- `work.task.mark-refreshed`, и лента догоняет карточку без всяких миграций.
-- Но карточке, которая с тех пор никуда не поехала, догонять нечего — отсюда
-- этот единственный проход.
--
-- Да, здесь JOIN из таблицы уведомлений в таблицы «Работы», чего сервисному
-- модулю делать нельзя. Миграция — не модуль: схема в портале одна, и правка
-- данных живёт на портальном уровне, как и сама схема. Важнее, что проход
-- РАЗОВЫЙ: повторно эти два мира здесь не встретятся, и разъехаться списку
-- синонимов ниже со списком в `work-task-status.ts` уже негде.
--
-- Связь через адрес, а не через FK: своей ссылки на `WorkTask` у уведомления
-- нет и быть не может (FK на модель чужого сервиса запрещён контрактом), а
-- адрес карточки уведомление хранит и так — `/work/planner/<spaceId>?task=<KEY>`,
-- ровно как его собирает `workTaskUrl`.
UPDATE "NotificationItem" AS n
SET "mark" = fresh."mark"
FROM (
  SELECT
    '/work/planner/' || t."spaceId" || '?task=' || s."prefix" || '-' || t."number" AS "url",
    CASE btrim(regexp_replace(lower(replace(c."name", 'ё', 'е')), '\s+', ' ', 'g'))
      WHEN 'в работе' THEN 'in_progress'
      WHEN 'в работу' THEN 'in_progress'
      WHEN 'работа' THEN 'in_progress'
      WHEN 'в процессе' THEN 'in_progress'
      WHEN 'делается' THEN 'in_progress'
      WHEN 'тестирование' THEN 'testing'
      WHEN 'тестерование' THEN 'testing'
      WHEN 'на тестировании' THEN 'testing'
      WHEN 'на тестеровании' THEN 'testing'
      WHEN 'тест' THEN 'testing'
      WHEN 'на проверке' THEN 'testing'
      WHEN 'проверка' THEN 'testing'
      WHEN 'выполнено' THEN 'done'
      WHEN 'готово' THEN 'done'
      WHEN 'сделано' THEN 'done'
      WHEN 'завершено' THEN 'done'
      WHEN 'закрыто' THEN 'done'
      WHEN 'на доработку' THEN 'rework'
      WHEN 'доработка' THEN 'rework'
      WHEN 'на доработке' THEN 'rework'
      WHEN 'вернули' THEN 'rework'
      WHEN 'возврат' THEN 'rework'
      -- Незнакомое название колонки — без пометки. Это норма: у своей доски
      -- колонки называют по-своему, и подписать чужой «Бэклог» одним из наших
      -- четырёх слов хуже, чем не подписать вовсе.
      ELSE NULL
    END AS "mark"
  FROM "WorkTask" t
  JOIN "WorkColumn" c ON c."id" = t."columnId"
  JOIN "WorkSpace" s ON s."id" = t."spaceId"
  -- Задача в архиве — новость о ней протухла вместе с ней.
  WHERE t."archivedAt" IS NULL
) AS fresh
WHERE n."category" = 'work'
  AND n."url" = fresh."url"
  AND n."mark" IS DISTINCT FROM fresh."mark";
