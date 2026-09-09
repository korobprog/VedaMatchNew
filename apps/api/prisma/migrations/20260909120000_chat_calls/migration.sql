-- Звонки в «Общении» (docs/chat-calls-plan.md, этап 1).
--
-- Вложение `call` — запись о звонке в ленте диалога. Значение енума не
-- используется в этой же миграции: Postgres не даёт применять новое значение
-- в той транзакции, где оно добавлено.
ALTER TYPE "ChatAttachmentKind" ADD VALUE 'call';

CREATE TYPE "ChatCallKind" AS ENUM ('audio', 'video');

CREATE TYPE "ChatCallStatus" AS ENUM (
  'ringing', 'accepted', 'declined', 'missed', 'cancelled', 'ended', 'failed'
);

-- Факт звонка. Сигналинг сюда не пишется — он живёт в событиях секунды.
CREATE TABLE "ChatCall" (
  "id"             TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "callerId"       TEXT NOT NULL,
  "calleeId"       TEXT NOT NULL,
  "kind"           "ChatCallKind" NOT NULL,
  "status"         "ChatCallStatus" NOT NULL DEFAULT 'ringing',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "answeredAt"     TIMESTAMP(3),
  "endedAt"        TIMESTAMP(3),
  "endedById"      TEXT,
  "endReason"      TEXT,
  "relayed"        BOOLEAN,

  CONSTRAINT "ChatCall_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatCall_conversationId_createdAt_idx" ON "ChatCall"("conversationId", "createdAt");
CREATE INDEX "ChatCall_callerId_createdAt_idx" ON "ChatCall"("callerId", "createdAt");
CREATE INDEX "ChatCall_calleeId_createdAt_idx" ON "ChatCall"("calleeId", "createdAt");
CREATE INDEX "ChatCall_status_createdAt_idx" ON "ChatCall"("status", "createdAt");

ALTER TABLE "ChatCall"
  ADD CONSTRAINT "ChatCall_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "ChatConversation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatCall"
  ADD CONSTRAINT "ChatCall_callerId_fkey"
  FOREIGN KEY ("callerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatCall"
  ADD CONSTRAINT "ChatCall_calleeId_fkey"
  FOREIGN KEY ("calleeId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Настройки сервиса «Общение»: пока один выключатель звонков.
CREATE TABLE "ChatSettings" (
  "id"           TEXT NOT NULL DEFAULT 'global',
  "callsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"    TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChatSettings_pkey" PRIMARY KEY ("id")
);
