-- Акт для клиента и напоминания об оплате (VED-461).

-- AlterTable
ALTER TABLE "public"."WorkBoard" ADD COLUMN     "paymentReminderDays" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "public"."WorkPayoutPeriod" ADD COLUMN     "actToken" TEXT,
ADD COLUMN     "remindedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "WorkPayoutPeriod_actToken_key" ON "public"."WorkPayoutPeriod"("actToken");
