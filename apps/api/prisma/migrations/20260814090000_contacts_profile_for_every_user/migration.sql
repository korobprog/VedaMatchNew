-- Карточка справочника для каждого участника портала.
--
-- До этой миграции ContactsProfile заводился только тем, кто сам открыл
-- редактор и сохранил заголовок: карточка без заголовка получала status
-- 'draft', а новых записей не создавал никто, поэтому справочник оставался
-- пустым при полностью заполненном портале.
--
-- Содержимое карточки (имя, аватар, город, духовный этап) справочник берёт
-- join-ом из "User", так что пустая по своим полям запись уже показывает
-- человека осмысленно — заполнять здесь нечего.
--
-- Способы связи это НЕ раскрывает: телефон и мессенджеры по-прежнему отдаются
-- только по действующему "ContactsDisclosure". Уйти из выдачи можно в любой
-- момент через visibility = 'hidden' в редакторе карточки.
--
-- Значения дефолтов продублированы в
-- apps/api/src/modules/contacts/contacts-defaults.ts.

-- Существующие черновики поднимаем в выдачу: 'draft' здесь всегда был
-- следствием пустого заголовка, а не осознанным решением владельца.
UPDATE "public"."ContactsProfile"
SET "status" = 'active',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'draft';

-- gen_random_uuid() из pgcrypto; в PostgreSQL 13+ доступна без extension.
INSERT INTO "public"."ContactsProfile" ("id", "userId", "status", "visibility", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", 'active', 'everyone', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "public"."User" u
WHERE NOT EXISTS (
  SELECT 1 FROM "public"."ContactsProfile" p WHERE p."userId" = u."id"
);
