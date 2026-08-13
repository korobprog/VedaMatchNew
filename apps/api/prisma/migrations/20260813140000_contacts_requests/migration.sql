-- Связь в справочнике: запрос контакта и журнал раскрытий.
-- Раскрытие вынесено в отдельную таблицу, а не в флаг на запросе: доступ
-- отзывается, и человек должен видеть историю «кому открыл и когда закрыл»,
-- а не чистый лист. Поэтому отзыв — это `revokedAt`, а не DELETE.

-- CreateEnum
CREATE TYPE "public"."ContactsRequestStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- CreateTable
CREATE TABLE "public"."ContactsRequest" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "message" TEXT,
    "status" "public"."ContactsRequestStatus" NOT NULL DEFAULT 'pending',
    -- createdAt переставляется на «сейчас» при повторном запросе после отказа:
    -- по нему считается суточный лимит, и старая дата дала бы обход лимита.
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "ContactsRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ContactsDisclosure" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "requestId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- NULL — доступ действует. Отозванная строка остаётся в журнале.
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ContactsDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Одна пара — один запрос: повторное обращение переоткрывает ту же строку,
-- иначе история обращений к человеку превратилась бы в спам-ленту.
CREATE UNIQUE INDEX "ContactsRequest_fromUserId_toUserId_key" ON "public"."ContactsRequest"("fromUserId", "toUserId");

-- CreateIndex
-- Список входящих: «мои запросы» с фильтром по статусу.
CREATE INDEX "ContactsRequest_toUserId_status_idx" ON "public"."ContactsRequest"("toUserId", "status");

-- CreateIndex
-- Суточный лимит: отправленные мной за последние 24 часа.
CREATE INDEX "ContactsRequest_fromUserId_createdAt_idx" ON "public"."ContactsRequest"("fromUserId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ContactsDisclosure_requestId_key" ON "public"."ContactsDisclosure"("requestId");

-- CreateIndex
-- Пара владелец+зритель уникальна: повторное согласие снимает revokedAt
-- у существующей строки, а не плодит дубли в журнале.
CREATE UNIQUE INDEX "ContactsDisclosure_ownerId_viewerId_key" ON "public"."ContactsDisclosure"("ownerId", "viewerId");

-- CreateIndex
-- Обратный обход: «чьи контакты открыты мне» — проверка на каждой карточке.
CREATE INDEX "ContactsDisclosure_viewerId_revokedAt_idx" ON "public"."ContactsDisclosure"("viewerId", "revokedAt");

-- AddForeignKey
ALTER TABLE "public"."ContactsRequest" ADD CONSTRAINT "ContactsRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactsRequest" ADD CONSTRAINT "ContactsRequest_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactsDisclosure" ADD CONSTRAINT "ContactsDisclosure_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ContactsDisclosure" ADD CONSTRAINT "ContactsDisclosure_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SetNull, а не Cascade: удаление запроса не должно стирать журнал раскрытий.
ALTER TABLE "public"."ContactsDisclosure" ADD CONSTRAINT "ContactsDisclosure_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "public"."ContactsRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
