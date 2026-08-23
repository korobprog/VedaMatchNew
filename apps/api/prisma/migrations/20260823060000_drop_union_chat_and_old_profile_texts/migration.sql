-- Снос того, что осталось от переезда переписки и общих полей профиля.
--
-- Переписка Знакомств переехала в «Общение» миграцией
-- `20260822090000_chat_service`. Перенос проверен на боевых данных поштучно:
-- все 47 сообщений и обе реакции нашлись в новых таблицах под теми же
-- идентификаторами. Держать копию дальше незачем.
--
-- Рассказ о себе и языки переехали в `User` миграцией
-- `20260823040000_portal_about_and_languages`; сервисы их больше не читают.
--
-- Шаг необратимый: восстановление — только из резервной копии базы.
DROP TABLE IF EXISTS "UnionMessageReaction";
DROP TABLE IF EXISTS "UnionChatMessage";

ALTER TABLE "UnionProfile"
  DROP COLUMN IF EXISTS "about",
  DROP COLUMN IF EXISTS "languages";

ALTER TABLE "ContactsProfile"
  DROP COLUMN IF EXISTS "about",
  DROP COLUMN IF EXISTS "languages";
