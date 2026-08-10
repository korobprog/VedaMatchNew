-- CreateEnum
CREATE TYPE "public"."AstroCompatibilityStatus" AS ENUM ('pending', 'accepted', 'declined');

-- CreateTable
CREATE TABLE "public"."AstroCompatibilityRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" "public"."AstroCompatibilityStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "AstroCompatibilityRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AstroCompatibilityReading" (
    "id" TEXT NOT NULL,
    "pairKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokensIn" INTEGER NOT NULL,
    "tokensOut" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AstroCompatibilityReading_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AstroCompatibilityRequest_targetId_status_idx" ON "public"."AstroCompatibilityRequest"("targetId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AstroCompatibilityRequest_requesterId_targetId_key" ON "public"."AstroCompatibilityRequest"("requesterId", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "AstroCompatibilityReading_pairKey_locale_promptVersion_key" ON "public"."AstroCompatibilityReading"("pairKey", "locale", "promptVersion");

-- AddForeignKey
ALTER TABLE "public"."AstroCompatibilityRequest" ADD CONSTRAINT "AstroCompatibilityRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AstroCompatibilityRequest" ADD CONSTRAINT "AstroCompatibilityRequest_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
