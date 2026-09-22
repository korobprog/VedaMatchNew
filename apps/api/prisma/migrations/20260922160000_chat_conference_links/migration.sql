-- Быстрая конференция по ссылке (VED-360). Комнатой служит обычная
-- групповая беседа — здесь заводится только её дверь.

-- CreateTable
CREATE TABLE "public"."ChatConferenceLink" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatConferenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatConferenceLink_conversationId_key" ON "public"."ChatConferenceLink"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConferenceLink_token_key" ON "public"."ChatConferenceLink"("token");

-- CreateIndex
CREATE INDEX "ChatConferenceLink_expiresAt_idx" ON "public"."ChatConferenceLink"("expiresAt");

-- CreateIndex
CREATE INDEX "ChatConferenceLink_createdById_idx" ON "public"."ChatConferenceLink"("createdById");

-- AddForeignKey
ALTER TABLE "public"."ChatConferenceLink" ADD CONSTRAINT "ChatConferenceLink_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "public"."ChatConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatConferenceLink" ADD CONSTRAINT "ChatConferenceLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
