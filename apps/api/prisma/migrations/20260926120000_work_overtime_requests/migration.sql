-- Запросы часов сверх нормы коммерческой доски (VED-459).

-- CreateEnum
CREATE TYPE "public"."WorkOvertimeRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

-- CreateTable
CREATE TABLE "public"."WorkOvertimeRequest" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "taskId" TEXT,
    "userId" TEXT,
    "fromDay" TEXT NOT NULL,
    "toDay" TEXT NOT NULL,
    "minutesPerDay" INTEGER NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "public"."WorkOvertimeRequestStatus" NOT NULL DEFAULT 'pending',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOvertimeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkOvertimeRequest_boardId_status_idx" ON "public"."WorkOvertimeRequest"("boardId", "status");

-- CreateIndex
CREATE INDEX "WorkOvertimeRequest_boardId_userId_fromDay_idx" ON "public"."WorkOvertimeRequest"("boardId", "userId", "fromDay");

-- AddForeignKey
ALTER TABLE "public"."WorkOvertimeRequest" ADD CONSTRAINT "WorkOvertimeRequest_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkOvertimeRequest" ADD CONSTRAINT "WorkOvertimeRequest_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."WorkTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkOvertimeRequest" ADD CONSTRAINT "WorkOvertimeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkOvertimeRequest" ADD CONSTRAINT "WorkOvertimeRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
