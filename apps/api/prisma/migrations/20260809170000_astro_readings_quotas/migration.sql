-- CreateEnum
CREATE TYPE "public"."AstroSection" AS ENUM ('overview', 'lagna', 'moon_nakshatra', 'dasha_current', 'career', 'relationships', 'strengths', 'practice');
-- CreateTable
CREATE TABLE "public"."AstroReading" (
    "id" TEXT NOT NULL,
    "chartFingerprint" TEXT NOT NULL,
    "section" "public"."AstroSection" NOT NULL,
    "locale" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AstroReading_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "public"."AstroUsage" (
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "readings" INTEGER NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AstroUsage_pkey" PRIMARY KEY ("userId","day")
);
-- CreateTable
CREATE TABLE "public"."AstroBudgetDay" (
    "day" DATE NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsdCents" INTEGER NOT NULL DEFAULT 0,
    "haltedAt" TIMESTAMP(3),
    CONSTRAINT "AstroBudgetDay_pkey" PRIMARY KEY ("day")
);
-- CreateTable
CREATE TABLE "public"."AstroSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailyReadingsPerUser" INTEGER NOT NULL DEFAULT 3,
    "dailyTokensPerUser" INTEGER NOT NULL DEFAULT 20000,
    "dailyTokenBudget" INTEGER NOT NULL DEFAULT 2000000,
    "dailyCostLimitUsdCents" INTEGER NOT NULL DEFAULT 1000,
    "transitPushEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AstroSettings_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "AstroReading_chartFingerprint_section_locale_promptVersion_key" ON "public"."AstroReading"("chartFingerprint", "section", "locale", "promptVersion");
-- AddForeignKey
ALTER TABLE "public"."AstroUsage" ADD CONSTRAINT "AstroUsage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
