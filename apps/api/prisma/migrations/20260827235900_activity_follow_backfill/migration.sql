-- Бэкфил графа ленты друзей.
--
-- `ActivityFollow` заполняется только событием `PortalAccessEvent`, которое
-- издаётся в момент нового мэтча (`union-connection.service.ts`) или нового
-- раскрытия контактов (`chat/people/people-requests.service.ts`). Миграция
-- 20260824050000_activity_service создала таблицу пустой, бэкфила в ней не
-- было — поэтому все связи, заключённые ДО того дня, для ленты не
-- существуют, и виджет в подвале главной не рендерится вовсе.
--
-- Здесь граф достраивается из тех же источников, что и события. Читаем чужие
-- таблицы SQL-ом, а не кодом модуля: контракт сервисного модуля запрещает
-- второе, разовая портальная миграция — не код сервиса.
--
-- Идемпотентно: ON CONFLICT DO NOTHING по уникальному ключу
-- (granterId, granteeId, source). Повторный прогон ничего не меняет.
-- gen_random_uuid() из pgcrypto; в PostgreSQL 13+ доступна без extension.

-- Мэтч открывает доступ в обе стороны сразу — так же, как это делает
-- announceMutualAccess(). Отсюда два зеркальных INSERT'а.
INSERT INTO "public"."ActivityFollow" ("id", "granterId", "granteeId", "source", "grantedAt")
SELECT
    gen_random_uuid()::text,
    r."fromUserId",
    r."toUserId",
    'union'::"public"."ActivityFollowSource",
    COALESCE(r."respondedAt", r."createdAt")
FROM "public"."UnionConnectionRequest" r
WHERE r."status" = 'accepted'
ON CONFLICT ("granterId", "granteeId", "source") DO NOTHING;

INSERT INTO "public"."ActivityFollow" ("id", "granterId", "granteeId", "source", "grantedAt")
SELECT
    gen_random_uuid()::text,
    r."toUserId",
    r."fromUserId",
    'union'::"public"."ActivityFollowSource",
    COALESCE(r."respondedAt", r."createdAt")
FROM "public"."UnionConnectionRequest" r
WHERE r."status" = 'accepted'
ON CONFLICT ("granterId", "granteeId", "source") DO NOTHING;

-- Раскрытие контактов односторонне: владелец открывает себя смотрящему.
-- granterId — тот, чья активность становится видна, то есть ownerId.
-- Отозванные раскрытия не переносим: ленте они не дают ничего, а строка с
-- revokedAt отличалась бы от того, что записал бы слушатель.
INSERT INTO "public"."ActivityFollow" ("id", "granterId", "granteeId", "source", "grantedAt")
SELECT
    gen_random_uuid()::text,
    d."ownerId",
    d."viewerId",
    'contacts'::"public"."ActivityFollowSource",
    d."grantedAt"
FROM "public"."ContactsDisclosure" d
WHERE d."revokedAt" IS NULL
ON CONFLICT ("granterId", "granteeId", "source") DO NOTHING;
