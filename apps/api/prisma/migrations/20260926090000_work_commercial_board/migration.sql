-- Коммерческая доска (VED-458): ставки доски, учёт времени, смета задачи.

-- CreateEnum
CREATE TYPE "public"."WorkBoardKind" AS ENUM ('regular', 'commercial');

-- CreateEnum
CREATE TYPE "public"."WorkPricingModel" AS ENUM ('hourly', 'fixed');

-- CreateEnum
CREATE TYPE "public"."WorkOvertimeMode" AS ENUM ('on_request', 'auto');

-- CreateEnum
CREATE TYPE "public"."WorkLineItemKind" AS ENUM ('expense', 'discount');

-- AlterTable
ALTER TABLE "public"."WorkBoard" ADD COLUMN     "budgetMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "clientName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'RUB',
ADD COLUMN     "dailyNormMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kind" "public"."WorkBoardKind" NOT NULL DEFAULT 'regular',
ADD COLUMN     "leadId" TEXT,
ADD COLUMN     "overtimeMode" "public"."WorkOvertimeMode" NOT NULL DEFAULT 'on_request',
ADD COLUMN     "overtimeRateMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pricingModel" "public"."WorkPricingModel" NOT NULL DEFAULT 'hourly',
ADD COLUMN     "rateMinor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow';

-- AlterTable
ALTER TABLE "public"."WorkTask" ADD COLUMN     "estimateMinutes" INTEGER,
ADD COLUMN     "priceMinor" INTEGER;

-- CreateTable
CREATE TABLE "public"."WorkTimeEntry" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTimeEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkTaskLineItem" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" "public"."WorkLineItemKind" NOT NULL,
    "title" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "position" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkTaskLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkTimeEntry_boardId_startedAt_idx" ON "public"."WorkTimeEntry"("boardId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkTimeEntry_taskId_startedAt_idx" ON "public"."WorkTimeEntry"("taskId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkTimeEntry_userId_endedAt_idx" ON "public"."WorkTimeEntry"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "WorkTaskLineItem_taskId_position_idx" ON "public"."WorkTaskLineItem"("taskId", "position");

-- AddForeignKey
ALTER TABLE "public"."WorkBoard" ADD CONSTRAINT "WorkBoard_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTimeEntry" ADD CONSTRAINT "WorkTimeEntry_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTimeEntry" ADD CONSTRAINT "WorkTimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTimeEntry" ADD CONSTRAINT "WorkTimeEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTaskLineItem" ADD CONSTRAINT "WorkTaskLineItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "public"."WorkTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
