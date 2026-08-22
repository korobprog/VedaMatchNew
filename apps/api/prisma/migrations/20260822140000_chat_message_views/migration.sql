-- Просмотры постов канала. Строка на человека, а не голый счётчик: иначе
-- один и тот же читатель накручивает просмотры каждым открытием ленты.
ALTER TABLE "public"."ChatMessage" ADD COLUMN "viewsCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "public"."ChatMessageView" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessageView_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMessageView_messageId_userId_key" ON "public"."ChatMessageView"("messageId", "userId");
CREATE INDEX "ChatMessageView_messageId_idx" ON "public"."ChatMessageView"("messageId");

ALTER TABLE "public"."ChatMessageView" ADD CONSTRAINT "ChatMessageView_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ChatMessageView" ADD CONSTRAINT "ChatMessageView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
