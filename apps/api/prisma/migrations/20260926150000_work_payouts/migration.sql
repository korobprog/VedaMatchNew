-- Календарь выплат и подбитие коммерческой доски (VED-460).

-- CreateEnum
CREATE TYPE "public"."WorkPayoutPeriodKind" AS ENUM ('weekly', 'biweekly', 'monthly');

-- CreateEnum
CREATE TYPE "public"."WorkPayoutStatus" AS ENUM ('closed', 'sent', 'paid');

-- AlterTable
ALTER TABLE "public"."WorkBoard" ADD COLUMN     "commercialSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "payoutAnchorDay" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "payoutDay" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "payoutPeriod" "public"."WorkPayoutPeriodKind" NOT NULL DEFAULT 'weekly';

-- AlterTable
ALTER TABLE "public"."WorkTask" ADD COLUMN     "pricePayoutPeriodId" TEXT;

-- AlterTable
ALTER TABLE "public"."WorkTaskLineItem" ADD COLUMN     "payoutPeriodId" TEXT;

-- AlterTable
ALTER TABLE "public"."WorkTimeEntry" ADD COLUMN     "billedOvertimeMinutes" INTEGER,
ADD COLUMN     "payoutPeriodId" TEXT;

-- CreateTable
CREATE TABLE "public"."WorkPayoutPeriod" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "fromDay" TEXT NOT NULL,
    "toDay" TEXT NOT NULL,
    "status" "public"."WorkPayoutStatus" NOT NULL DEFAULT 'closed',
    "snapshot" JSONB NOT NULL,
    "totalMinor" INTEGER NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paidNote" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "WorkPayoutPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkPayoutPeriod_boardId_toDay_idx" ON "public"."WorkPayoutPeriod"("boardId", "toDay");

-- CreateIndex
CREATE UNIQUE INDEX "WorkPayoutPeriod_boardId_fromDay_key" ON "public"."WorkPayoutPeriod"("boardId", "fromDay");

-- CreateIndex
CREATE INDEX "WorkTimeEntry_boardId_payoutPeriodId_idx" ON "public"."WorkTimeEntry"("boardId", "payoutPeriodId");

-- AddForeignKey
ALTER TABLE "public"."WorkTask" ADD CONSTRAINT "WorkTask_pricePayoutPeriodId_fkey" FOREIGN KEY ("pricePayoutPeriodId") REFERENCES "public"."WorkPayoutPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTimeEntry" ADD CONSTRAINT "WorkTimeEntry_payoutPeriodId_fkey" FOREIGN KEY ("payoutPeriodId") REFERENCES "public"."WorkPayoutPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkTaskLineItem" ADD CONSTRAINT "WorkTaskLineItem_payoutPeriodId_fkey" FOREIGN KEY ("payoutPeriodId") REFERENCES "public"."WorkPayoutPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkPayoutPeriod" ADD CONSTRAINT "WorkPayoutPeriod_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "public"."WorkBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
