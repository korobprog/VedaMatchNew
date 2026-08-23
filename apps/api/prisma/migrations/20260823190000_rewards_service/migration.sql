-- Сервис «Баллы и рефералы». Баланс не хранится колонкой: он считается
-- суммой RewardsLedgerEntry.amount, см. docs/rewards-service-plan.md.

-- CreateEnum
CREATE TYPE "RewardsLedgerType" AS ENUM ('welcome', 'referral_l1', 'referral_l2', 'admin_revoke', 'reserve', 'commit', 'release');

-- CreateEnum
CREATE TYPE "RewardsReferralStatus" AS ENUM ('registered', 'qualified', 'awarded', 'rejected');

-- CreateEnum
CREATE TYPE "RewardsFraudReason" AS ENUM ('self_invite', 'email_alias', 'device_match', 'ip_match', 'monthly_cap');

-- CreateTable
CREATE TABLE "RewardsAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "signupIp" TEXT,
    "signupDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardsAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardsAccount_userId_key" ON "RewardsAccount"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardsAccount_code_key" ON "RewardsAccount"("code");

-- CreateIndex
CREATE INDEX "RewardsAccount_code_idx" ON "RewardsAccount"("code");

-- CreateTable
CREATE TABLE "RewardsReferral" (
    "id" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "source" TEXT,
    "status" "RewardsReferralStatus" NOT NULL DEFAULT 'registered',
    "activityAt" TIMESTAMP(3),
    "activityKind" TEXT,
    "qualifiedAt" TIMESTAMP(3),
    "awardedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "eligibleAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardsReferral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardsReferral_inviteeId_key" ON "RewardsReferral"("inviteeId");

-- CreateIndex
CREATE INDEX "RewardsReferral_inviterId_status_idx" ON "RewardsReferral"("inviterId", "status");

-- CreateIndex
CREATE INDEX "RewardsReferral_status_eligibleAt_idx" ON "RewardsReferral"("status", "eligibleAt");

-- CreateIndex
CREATE INDEX "RewardsReferral_createdAt_idx" ON "RewardsReferral"("createdAt");

-- CreateTable
CREATE TABLE "RewardsLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "RewardsLedgerType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "referralId" TEXT,
    "revokesId" TEXT,
    "actorId" TEXT,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardsLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RewardsLedgerEntry_revokesId_key" ON "RewardsLedgerEntry"("revokesId");

-- CreateIndex
CREATE INDEX "RewardsLedgerEntry_userId_createdAt_idx" ON "RewardsLedgerEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardsLedgerEntry_type_createdAt_idx" ON "RewardsLedgerEntry"("type", "createdAt");

-- CreateIndex
CREATE INDEX "RewardsLedgerEntry_createdAt_idx" ON "RewardsLedgerEntry"("createdAt");

-- CreateTable
CREATE TABLE "RewardsSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "levelOnePoints" INTEGER NOT NULL DEFAULT 30,
    "levelTwoPoints" INTEGER NOT NULL DEFAULT 5,
    "welcomePoints" INTEGER NOT NULL DEFAULT 10,
    "monthlyCapPoints" INTEGER NOT NULL DEFAULT 300,
    "accrualDelayHours" INTEGER NOT NULL DEFAULT 24,
    "qualifyMinDays" INTEGER NOT NULL DEFAULT 3,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardsSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardsFraudLog" (
    "id" TEXT NOT NULL,
    "reason" "RewardsFraudReason" NOT NULL,
    "inviterId" TEXT,
    "inviteeId" TEXT,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RewardsFraudLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RewardsFraudLog_createdAt_idx" ON "RewardsFraudLog"("createdAt");

-- CreateIndex
CREATE INDEX "RewardsFraudLog_reason_createdAt_idx" ON "RewardsFraudLog"("reason", "createdAt");

-- AddForeignKey
ALTER TABLE "RewardsAccount" ADD CONSTRAINT "RewardsAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardsReferral" ADD CONSTRAINT "RewardsReferral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardsReferral" ADD CONSTRAINT "RewardsReferral_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardsLedgerEntry" ADD CONSTRAINT "RewardsLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardsLedgerEntry" ADD CONSTRAINT "RewardsLedgerEntry_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "RewardsReferral"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardsLedgerEntry" ADD CONSTRAINT "RewardsLedgerEntry_revokesId_fkey" FOREIGN KEY ("revokesId") REFERENCES "RewardsLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardsLedgerEntry" ADD CONSTRAINT "RewardsLedgerEntry_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardsFraudLog" ADD CONSTRAINT "RewardsFraudLog_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardsFraudLog" ADD CONSTRAINT "RewardsFraudLog_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
