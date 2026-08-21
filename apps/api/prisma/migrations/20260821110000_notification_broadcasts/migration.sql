-- Рассылки администрации: черновик, фоновая отправка пакетами, итог.
CREATE TYPE "NotificationBroadcastStatus" AS ENUM ('draft', 'sending', 'sent', 'failed', 'cancelled');

CREATE TABLE "NotificationBroadcast" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "important" BOOLEAN NOT NULL DEFAULT false,
    "audience" JSONB NOT NULL,
    "status" "NotificationBroadcastStatus" NOT NULL DEFAULT 'draft',
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "pushSentCount" INTEGER NOT NULL DEFAULT 0,
    "cursorUserId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "NotificationBroadcast_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificationBroadcast_status_updatedAt_idx" ON "NotificationBroadcast"("status", "updatedAt");
CREATE INDEX "NotificationBroadcast_createdAt_idx" ON "NotificationBroadcast"("createdAt" DESC);

ALTER TABLE "NotificationBroadcast" ADD CONSTRAINT "NotificationBroadcast_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
