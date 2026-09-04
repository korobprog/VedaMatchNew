-- DropIndex
DROP INDEX "public"."PersonalRecord_copiedAt_idx";

-- AlterTable
ALTER TABLE "public"."PersonalRecord" ADD COLUMN     "copyAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "copyStartedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PersonalRecord_copiedAt_copyStartedAt_idx" ON "public"."PersonalRecord"("copiedAt", "copyStartedAt");
