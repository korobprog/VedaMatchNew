-- Union service: профиль, намерения, запросы на знакомство

-- CreateEnum
CREATE TYPE "UnionIntentionType" AS ENUM ('family', 'business', 'friendship', 'service');

-- CreateEnum
CREATE TYPE "UnionConnectionStatus" AS ENUM ('pending', 'accepted', 'declined', 'cancelled');

-- CreateEnum
CREATE TYPE "UnionFormat" AS ENUM ('online', 'offline', 'any');

-- CreateTable
CREATE TABLE "UnionProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "about" TEXT,
    "relocationReady" BOOLEAN NOT NULL DEFAULT false,
    "format" "UnionFormat" NOT NULL DEFAULT 'any',
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "interests" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "values" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "familyStatus" TEXT,
    "privacy" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnionIntention" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "type" "UnionIntentionType" NOT NULL,
    "weight" INTEGER NOT NULL,

    CONSTRAINT "UnionIntention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnionConnectionRequest" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "UnionConnectionStatus" NOT NULL DEFAULT 'pending',
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "UnionConnectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnionProfile_userId_key" ON "UnionProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UnionIntention_profileId_type_key" ON "UnionIntention"("profileId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "UnionConnectionRequest_fromUserId_toUserId_key" ON "UnionConnectionRequest"("fromUserId", "toUserId");

-- CreateIndex
CREATE INDEX "UnionConnectionRequest_toUserId_status_idx" ON "UnionConnectionRequest"("toUserId", "status");

-- AddForeignKey
ALTER TABLE "UnionProfile" ADD CONSTRAINT "UnionProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnionIntention" ADD CONSTRAINT "UnionIntention_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UnionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnionConnectionRequest" ADD CONSTRAINT "UnionConnectionRequest_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnionConnectionRequest" ADD CONSTRAINT "UnionConnectionRequest_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
