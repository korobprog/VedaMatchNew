-- CreateEnum
CREATE TYPE "SpiritualStage" AS ENUM ('seeker', 'practitioner', 'yogi', 'devotee');

-- CreateEnum
CREATE TYPE "DevoteeVerificationStatus" AS ENUM ('self_identified', 'awaiting_mentor', 'mentor_submitted', 'awaiting_admin', 'confirmed', 'rejected', 'needs_clarification');

-- CreateEnum
CREATE TYPE "StageChangeActor" AS ENUM ('system', 'user', 'admin');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "spiritualStage" "SpiritualStage",
ADD COLUMN "devoteeVerificationStatus" "DevoteeVerificationStatus",
ADD COLUMN "lastSelfIdentificationAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Service" ADD COLUMN "seekerVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "practitionerVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "yogiVisible" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "devoteeSelfIdentifiedVisible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "devoteeVerifiedVisible" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SelfIdentificationResponse" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "detectedStage" "SpiritualStage" NOT NULL,
    "verificationStatus" "DevoteeVerificationStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelfIdentificationResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StageHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "oldStage" "SpiritualStage",
    "newStage" "SpiritualStage" NOT NULL,
    "actor" "StageChangeActor" NOT NULL,
    "reason" TEXT,
    "answers" JSONB,
    "verificationStatus" "DevoteeVerificationStatus",
    "mentorRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentorVerificationRequest" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DevoteeVerificationStatus" NOT NULL DEFAULT 'awaiting_mentor',
    "mentorName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "cityOrCommunity" TEXT,
    "knownDuration" TEXT,
    "knowsPersonally" BOOLEAN,
    "confirmsRegularPractice" BOOLEAN,
    "confirmsService" BOOLEAN,
    "confirmsSpiritualName" BOOLEAN,
    "confirmsCommunityConnection" BOOLEAN,
    "userCharacterReference" TEXT,
    "recommendsDevoteeStatus" BOOLEAN,
    "truthConsent" BOOLEAN,
    "mentorSubmittedAt" TIMESTAMP(3),
    "adminNote" TEXT,
    "adminReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MentorVerificationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SelfIdentificationResponse_userId_createdAt_idx" ON "SelfIdentificationResponse"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "StageHistory_userId_createdAt_idx" ON "StageHistory"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MentorVerificationRequest_token_key" ON "MentorVerificationRequest"("token");

-- CreateIndex
CREATE INDEX "MentorVerificationRequest_userId_status_idx" ON "MentorVerificationRequest"("userId", "status");

-- AddForeignKey
ALTER TABLE "SelfIdentificationResponse" ADD CONSTRAINT "SelfIdentificationResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StageHistory" ADD CONSTRAINT "StageHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MentorVerificationRequest" ADD CONSTRAINT "MentorVerificationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
