-- CreateEnum
CREATE TYPE "public"."ChatGroupCallStatus" AS ENUM ('live', 'ended');

-- CreateEnum
CREATE TYPE "public"."ChatGroupCallParticipantState" AS ENUM ('joined', 'left');

-- CreateTable
CREATE TABLE "public"."ChatGroupCall" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "startedById" TEXT NOT NULL,
    "hostId" TEXT,
    "kind" "public"."ChatCallKind" NOT NULL DEFAULT 'audio',
    "status" "public"."ChatGroupCallStatus" NOT NULL DEFAULT 'live',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "ChatGroupCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatGroupCallParticipant" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "state" "public"."ChatGroupCallParticipantState" NOT NULL DEFAULT 'joined',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "muted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ChatGroupCallParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatGroupCall_conversationId_status_idx" ON "public"."ChatGroupCall"("conversationId", "status");

-- CreateIndex
CREATE INDEX "ChatGroupCall_status_createdAt_idx" ON "public"."ChatGroupCall"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ChatGroupCallParticipant_callId_state_idx" ON "public"."ChatGroupCallParticipant"("callId", "state");

-- CreateIndex
CREATE INDEX "ChatGroupCallParticipant_state_lastSeenAt_idx" ON "public"."ChatGroupCallParticipant"("state", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatGroupCallParticipant_callId_userId_key" ON "public"."ChatGroupCallParticipant"("callId", "userId");

-- AddForeignKey
ALTER TABLE "public"."ChatGroupCall" ADD CONSTRAINT "ChatGroupCall_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatGroupCall" ADD CONSTRAINT "ChatGroupCall_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatGroupCall" ADD CONSTRAINT "ChatGroupCall_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatGroupCallParticipant" ADD CONSTRAINT "ChatGroupCallParticipant_callId_fkey" FOREIGN KEY ("callId") REFERENCES "public"."ChatGroupCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatGroupCallParticipant" ADD CONSTRAINT "ChatGroupCallParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Одна живая комната на беседу: гонка двух «начать звонок» обязана дать
-- одну комнату, а не две (частичный уникальный индекс — Prisma такого не
-- умеет объявить в схеме, см. docs/prisma-raw-sql-objects.md).
CREATE UNIQUE INDEX "ChatGroupCall_one_live_per_conversation"
  ON "public"."ChatGroupCall" ("conversationId")
  WHERE "status" = 'live';
