-- CreateTable
CREATE TABLE "public"."UnionMessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnionMessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnionMessageReaction_messageId_idx" ON "public"."UnionMessageReaction"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "UnionMessageReaction_messageId_userId_key" ON "public"."UnionMessageReaction"("messageId", "userId");

-- AddForeignKey
ALTER TABLE "public"."UnionMessageReaction" ADD CONSTRAINT "UnionMessageReaction_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."UnionChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UnionMessageReaction" ADD CONSTRAINT "UnionMessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
