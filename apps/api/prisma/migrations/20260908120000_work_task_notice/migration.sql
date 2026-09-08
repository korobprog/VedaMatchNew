-- Очередь дозревания уведомлений о переездах карточки «Работы».
CREATE TABLE "WorkTaskNotice" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "fromColumnId" TEXT NOT NULL,
    "notifyAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkTaskNotice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkTaskNotice_taskId_recipientId_key" ON "WorkTaskNotice"("taskId", "recipientId");

CREATE INDEX "WorkTaskNotice_notifyAt_claimedAt_idx" ON "WorkTaskNotice"("notifyAt", "claimedAt");

ALTER TABLE "WorkTaskNotice" ADD CONSTRAINT "WorkTaskNotice_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskNotice" ADD CONSTRAINT "WorkTaskNotice_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkTaskNotice" ADD CONSTRAINT "WorkTaskNotice_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
