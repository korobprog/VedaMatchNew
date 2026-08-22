-- CreateEnum
CREATE TYPE "public"."ChatConversationKind" AS ENUM ('direct', 'group', 'channel');

-- CreateEnum
CREATE TYPE "public"."ChatConversationState" AS ENUM ('request', 'active', 'declined', 'archived');

-- CreateEnum
CREATE TYPE "public"."ChatMemberRole" AS ENUM ('owner', 'admin', 'member');

-- CreateEnum
CREATE TYPE "public"."ChatAttachmentKind" AS ENUM ('image', 'file', 'voice', 'story', 'notice', 'listing', 'contact');

-- CreateEnum
CREATE TYPE "public"."ChatReportStatus" AS ENUM ('open', 'resolved', 'rejected');



-- CreateTable
CREATE TABLE "public"."ChatConversation" (
    "id" TEXT NOT NULL,
    "kind" "public"."ChatConversationKind" NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "avatarKey" TEXT,
    "avatarUrl" TEXT,
    "directKey" TEXT,
    "communityId" TEXT,
    "createdById" TEXT,
    "state" "public"."ChatConversationState" NOT NULL DEFAULT 'active',
    "requestedById" TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMember" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."ChatMemberRole" NOT NULL DEFAULT 'member',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadAt" TIMESTAMP(3),
    "mutedUntil" TIMESTAMP(3),
    "pinnedAt" TIMESTAMP(3),
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ChatMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "replyToId" TEXT,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatAttachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "kind" "public"."ChatAttachmentKind" NOT NULL,
    "url" TEXT,
    "key" TEXT,
    "previewUrl" TEXT,
    "title" TEXT,
    "subtitle" TEXT,
    "body" TEXT,
    "sourceService" TEXT,
    "sourceId" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "durationSec" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "waveform" INTEGER[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "conversationId" TEXT,
    "messageId" TEXT,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "status" "public"."ChatReportStatus" NOT NULL DEFAULT 'open',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decision" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_directKey_key" ON "public"."ChatConversation"("directKey");

-- CreateIndex
CREATE INDEX "ChatConversation_kind_lastMessageAt_idx" ON "public"."ChatConversation"("kind", "lastMessageAt");

-- CreateIndex
CREATE INDEX "ChatConversation_communityId_idx" ON "public"."ChatConversation"("communityId");

-- CreateIndex
CREATE INDEX "ChatMember_userId_leftAt_idx" ON "public"."ChatMember"("userId", "leftAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMember_conversationId_userId_key" ON "public"."ChatMember"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "ChatMessage_conversationId_createdAt_idx" ON "public"."ChatMessage"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_authorId_idx" ON "public"."ChatMessage"("authorId");

-- CreateIndex
CREATE INDEX "ChatAttachment_messageId_position_idx" ON "public"."ChatAttachment"("messageId", "position");

-- CreateIndex
CREATE INDEX "ChatMessageReaction_messageId_idx" ON "public"."ChatMessageReaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessageReaction_messageId_userId_key" ON "public"."ChatMessageReaction"("messageId", "userId");

-- CreateIndex
CREATE INDEX "ChatReport_status_createdAt_idx" ON "public"."ChatReport"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."ChatConversation" ADD CONSTRAINT "ChatConversation_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatConversation" ADD CONSTRAINT "ChatConversation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMember" ADD CONSTRAINT "ChatMember_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMember" ADD CONSTRAINT "ChatMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "public"."ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessageReaction" ADD CONSTRAINT "ChatMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatReport" ADD CONSTRAINT "ChatReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatReport" ADD CONSTRAINT "ChatReport_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatReport" ADD CONSTRAINT "ChatReport_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatReport" ADD CONSTRAINT "ChatReport_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ===== Перенос чата Знакомств в сервис «Общение» =====
-- Принятая заявка Union — это и есть личный диалог. Ключ пары собираем так
-- же, как его собирает код (меньший id первым), иначе первая же отправка
-- в перенесённый диалог создала бы второй.

INSERT INTO "public"."ChatConversation"
  ("id", "kind", "state", "directKey", "createdById", "requestedById", "lastMessageAt", "createdAt", "updatedAt")
SELECT
  r."id",
  'direct'::"public"."ChatConversationKind",
  'active'::"public"."ChatConversationState",
  LEAST(r."fromUserId", r."toUserId") || ':' || GREATEST(r."fromUserId", r."toUserId"),
  r."fromUserId",
  r."fromUserId",
  (SELECT MAX(m."createdAt") FROM "public"."UnionChatMessage" m WHERE m."requestId" = r."id"),
  r."createdAt",
  COALESCE(r."respondedAt", r."createdAt")
FROM "public"."UnionConnectionRequest" r
WHERE r."status" = 'accepted'
  -- Пара могла принять заявку дважды (в обе стороны) — переносим одну.
  AND NOT EXISTS (
    SELECT 1 FROM "public"."ChatConversation" c
    WHERE c."directKey" = LEAST(r."fromUserId", r."toUserId") || ':' || GREATEST(r."fromUserId", r."toUserId")
  );

-- Участники: обе стороны заявки. `lastReadAt` сворачиваем из отметок
-- прочтения входящих сообщений — своего максимума прочитанного хватает,
-- чтобы счётчик непрочитанного после переезда остался прежним.
INSERT INTO "public"."ChatMember" ("id", "conversationId", "userId", "role", "joinedAt", "lastReadAt")
SELECT
  gen_random_uuid(),
  c."id",
  u."userId",
  'member'::"public"."ChatMemberRole",
  c."createdAt",
  (
    SELECT MAX(m."readAt")
    FROM "public"."UnionChatMessage" m
    WHERE m."requestId" = r."id" AND m."fromUserId" <> u."userId" AND m."readAt" IS NOT NULL
  )
FROM "public"."ChatConversation" c
JOIN "public"."UnionConnectionRequest" r ON r."id" = c."id"
CROSS JOIN LATERAL (VALUES (r."fromUserId"), (r."toUserId")) AS u("userId")
WHERE c."kind" = 'direct'
ON CONFLICT ("conversationId", "userId") DO NOTHING;

INSERT INTO "public"."ChatMessage" ("id", "conversationId", "authorId", "body", "editedAt", "createdAt")
SELECT m."id", m."requestId", m."fromUserId", m."body", m."editedAt", m."createdAt"
FROM "public"."UnionChatMessage" m
JOIN "public"."ChatConversation" c ON c."id" = m."requestId";

INSERT INTO "public"."ChatMessageReaction" ("id", "messageId", "userId", "emoji", "createdAt")
SELECT x."id", x."messageId", x."userId", x."emoji", x."createdAt"
FROM "public"."UnionMessageReaction" x
JOIN "public"."ChatMessage" m ON m."id" = x."messageId";
