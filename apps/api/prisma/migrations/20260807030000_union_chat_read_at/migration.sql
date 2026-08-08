-- AlterTable
ALTER TABLE "public"."UnionChatMessage" ADD COLUMN     "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "UnionChatMessage_requestId_readAt_idx" ON "public"."UnionChatMessage"("requestId", "readAt");
