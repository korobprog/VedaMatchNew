-- Официальный канал VedaMatch (фаза 2б мобильного приложения).
-- Один на портал: в нём подписаны все участники, пишут администраторы портала.

ALTER TABLE "ChatConversation" ADD COLUMN "official" BOOLEAN NOT NULL DEFAULT false;

-- Единственность официального канала. Prisma частичные индексы не описывает,
-- объект перечислен в docs/prisma-raw-sql-objects.md.
CREATE UNIQUE INDEX "ChatConversation_official_single_idx"
  ON "ChatConversation" ("official") WHERE "official" = true;

-- Сам канал. Создатель — первый по времени активный администратор, как у
-- приветствия новичкам; без администраторов канал всё равно создаётся.
INSERT INTO "ChatConversation"
  ("id", "kind", "title", "description", "createdById", "state", "visibility", "official", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  'channel',
  'VedaMatch',
  'Новости портала и его сервисов',
  (SELECT u."id" FROM "User" u WHERE u."role" = 'admin' AND u."accountStatus" = 'active' ORDER BY u."createdAt" ASC LIMIT 1),
  'active',
  'public',
  true,
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM "ChatConversation" c WHERE c."official" = true);

-- Подписка всех активных участников. Уведомления по каналу выключены
-- (mutedUntil на сто лет вперёд): включаются только явным согласием, это
-- требование App Store 4.5.4 и антиспама Google Play. Администраторы портала
-- получают роль admin, чтобы писать, и уведомления у них не глушатся.
INSERT INTO "ChatMember" ("id", "conversationId", "userId", "role", "joinedAt", "mutedUntil")
SELECT
  gen_random_uuid()::text,
  c."id",
  u."id",
  CASE WHEN u."role" = 'admin' THEN 'admin'::"ChatMemberRole" ELSE 'member'::"ChatMemberRole" END,
  NOW(),
  CASE WHEN u."role" = 'admin' THEN NULL ELSE NOW() + INTERVAL '100 years' END
FROM "User" u
CROSS JOIN (SELECT "id" FROM "ChatConversation" WHERE "official" = true LIMIT 1) c
WHERE u."accountStatus" = 'active'
ON CONFLICT ("conversationId", "userId") DO NOTHING;
