-- Справочник людей переехал из сервиса «Контакты» в «Общение» разделом
-- «Люди»: маршруты стали `chat/people/*`, код — `modules/chat/people/`.
--
-- Таблицы и типы менять не стали: `ContactsProfile`, `ContactsRequest`,
-- `ContactsDisclosure`, `ContactsTag`, `ContactsProfileTag` и их энумы
-- сохраняют имена. Переименование потребовало бы переписать данные на живом
-- портале ради косметики; долг записан в docs/service-module-contract.md.
--
-- Здесь только то, без чего переезд ломает права: карточка сервиса
-- «Контакты» уходит из каталога (её убирает seed), а `ServiceAdmin` и
-- `ServiceAccess` каскадом удалились бы вместе с ней. Поэтому сначала
-- переносим их на `chat`, потом убираем сам сервис.

INSERT INTO "ServiceAdmin" ("userId", "serviceId", "createdAt")
SELECT sa."userId", chat."id", sa."createdAt"
FROM "ServiceAdmin" sa
JOIN "Service" old ON old."id" = sa."serviceId" AND old."slug" = 'contacts'
JOIN "Service" chat ON chat."slug" = 'chat'
ON CONFLICT ("userId", "serviceId") DO NOTHING;

INSERT INTO "ServiceAccess" ("userId", "serviceId")
SELECT sa."userId", chat."id"
FROM "ServiceAccess" sa
JOIN "Service" old ON old."id" = sa."serviceId" AND old."slug" = 'contacts'
JOIN "Service" chat ON chat."slug" = 'chat'
ON CONFLICT ("userId", "serviceId") DO NOTHING;

DELETE FROM "Service" WHERE "slug" = 'contacts';
