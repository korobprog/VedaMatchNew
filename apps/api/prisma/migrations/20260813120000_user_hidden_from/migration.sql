-- Односторонняя невидимость поверх симметричного UserBlock. Нужна, чтобы отказ
-- по заявке в Union убирал отказавшего из выдачи справочников, не заставляя
-- сервисы читать таблицы друг друга: факт живёт на уровне платформы.

-- CreateEnum
CREATE TYPE "public"."UserHideScope" AS ENUM ('all', 'union', 'contacts');

-- CreateEnum
CREATE TYPE "public"."UserHideSource" AS ENUM ('manual', 'union_declined', 'moderation');

-- CreateTable
CREATE TABLE "public"."UserHiddenFrom" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "scope" "public"."UserHideScope" NOT NULL DEFAULT 'all',
    "source" "public"."UserHideSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "UserHiddenFrom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserHiddenFrom_ownerId_viewerId_scope_key" ON "public"."UserHiddenFrom"("ownerId", "viewerId", "scope");

-- CreateIndex
CREATE INDEX "UserHiddenFrom_viewerId_scope_expiresAt_idx" ON "public"."UserHiddenFrom"("viewerId", "scope", "expiresAt");

-- AddForeignKey
ALTER TABLE "public"."UserHiddenFrom" ADD CONSTRAINT "UserHiddenFrom_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserHiddenFrom" ADD CONSTRAINT "UserHiddenFrom_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Переносим уже состоявшиеся отказы: без бэкфилла прошлые «нет» не действуют,
-- и человек, которому отказали до релиза, продолжит видеть отказавшего.
-- Владелец записи — тот, кто отказал (toUserId), скрыт от отправителя заявки.
INSERT INTO "public"."UserHiddenFrom" ("id", "ownerId", "viewerId", "scope", "source", "createdAt")
SELECT
    gen_random_uuid(),
    r."toUserId",
    r."fromUserId",
    'all'::"public"."UserHideScope",
    'union_declined'::"public"."UserHideSource",
    COALESCE(r."respondedAt", r."createdAt")
FROM "public"."UnionConnectionRequest" r
WHERE r."status" = 'declined'
ON CONFLICT ("ownerId", "viewerId", "scope") DO NOTHING;
