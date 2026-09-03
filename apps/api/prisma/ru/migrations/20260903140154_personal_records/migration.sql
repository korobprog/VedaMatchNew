-- CreateEnum
CREATE TYPE "public"."ConsentKind" AS ENUM ('processing', 'cross_border');

-- CreateTable
CREATE TABLE "public"."PersonalRecord" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "spiritualName" TEXT,
    "birthDate" DATE,
    "gender" TEXT,
    "avatarKey" TEXT,
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "copiedAt" TIMESTAMP(3),

    CONSTRAINT "PersonalRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PersonalBirthData" (
    "recordId" TEXT NOT NULL,
    "bornAtUtc" TIMESTAMP(3) NOT NULL,
    "birthDateLocal" DATE NOT NULL,
    "birthTimeLocal" TEXT,
    "placeLabel" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timeZone" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalBirthData_pkey" PRIMARY KEY ("recordId")
);

-- CreateTable
CREATE TABLE "public"."PersonalConsent" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "kind" "public"."ConsentKind" NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedIp" TEXT,

    CONSTRAINT "PersonalConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalRecord_email_key" ON "public"."PersonalRecord"("email");

-- CreateIndex
CREATE INDEX "PersonalRecord_copiedAt_idx" ON "public"."PersonalRecord"("copiedAt");

-- CreateIndex
CREATE INDEX "PersonalConsent_recordId_idx" ON "public"."PersonalConsent"("recordId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonalConsent_recordId_kind_policyVersion_key" ON "public"."PersonalConsent"("recordId", "kind", "policyVersion");

-- AddForeignKey
ALTER TABLE "public"."PersonalBirthData" ADD CONSTRAINT "PersonalBirthData_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "public"."PersonalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonalConsent" ADD CONSTRAINT "PersonalConsent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "public"."PersonalRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
