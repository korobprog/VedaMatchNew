-- CreateTable
CREATE TABLE "public"."NotificationItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "NotificationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NotificationItem_userId_readAt_idx" ON "public"."NotificationItem"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationItem_userId_createdAt_idx" ON "public"."NotificationItem"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."NotificationItem" ADD CONSTRAINT "NotificationItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
