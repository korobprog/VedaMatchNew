-- Беседа помнит, о чём она: контекст от другого сервиса (отклик в
-- «Вакансиях») снимком из события. См. VED-32.

-- AlterTable
ALTER TABLE "public"."ChatConversation"
  ADD COLUMN "contextService" TEXT,
  ADD COLUMN "contextId" TEXT,
  ADD COLUMN "contextTitle" TEXT,
  ADD COLUMN "contextStatus" TEXT,
  ADD COLUMN "contextMeta" JSONB;

-- CreateIndex
CREATE INDEX "ChatConversation_contextService_contextId_idx" ON "public"."ChatConversation"("contextService", "contextId");
