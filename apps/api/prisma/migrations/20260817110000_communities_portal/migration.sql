-- CreateEnum
CREATE TYPE "public"."CommunityKind" AS ENUM ('yatra', 'temple', 'ashram', 'nama_hatta', 'farm', 'club', 'center', 'project');

-- CreateEnum
CREATE TYPE "public"."CommunityStatus" AS ENUM ('draft', 'pending', 'active', 'paused', 'archived', 'hidden_by_reports', 'removed_by_admin');

-- CreateEnum
CREATE TYPE "public"."CommunityJoinPolicy" AS ENUM ('open', 'request_approval', 'invite_only');

-- CreateEnum
CREATE TYPE "public"."CommunityMemberRole" AS ENUM ('owner', 'admin', 'moderator', 'member');

-- CreateEnum
CREATE TYPE "public"."CommunityMemberStatus" AS ENUM ('pending', 'active', 'declined', 'left', 'removed');

-- CreateTable
CREATE TABLE "public"."Community" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "public"."CommunityKind" NOT NULL,
    "name" TEXT NOT NULL,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "logoKey" TEXT,
    "logoUrl" TEXT,
    "coverKey" TEXT,
    "coverUrl" TEXT,
    "location" JSONB,
    "city" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "address" TEXT,
    "timezone" TEXT,
    "messengers" JSONB,
    "links" JSONB,
    "joinPolicy" "public"."CommunityJoinPolicy" NOT NULL DEFAULT 'request_approval',
    "status" "public"."CommunityStatus" NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "createdById" TEXT,
    "membersCount" INTEGER NOT NULL DEFAULT 0,
    "noticesCount" INTEGER NOT NULL DEFAULT 0,
    "openReportsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Community_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunityMember" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."CommunityMemberRole" NOT NULL DEFAULT 'member',
    "status" "public"."CommunityMemberStatus" NOT NULL DEFAULT 'pending',
    "title" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CommunityOwnershipTransfer" (
    "id" TEXT NOT NULL,
    "communityId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),

    CONSTRAINT "CommunityOwnershipTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Community_slug_key" ON "public"."Community"("slug");

-- CreateIndex
CREATE INDEX "Community_status_city_idx" ON "public"."Community"("status", "city");

-- CreateIndex
CREATE INDEX "Community_status_kind_idx" ON "public"."Community"("status", "kind");

-- CreateIndex
CREATE INDEX "Community_status_membersCount_idx" ON "public"."Community"("status", "membersCount" DESC);

-- CreateIndex
CREATE INDEX "CommunityMember_userId_status_idx" ON "public"."CommunityMember"("userId", "status");

-- CreateIndex
CREATE INDEX "CommunityMember_communityId_status_role_idx" ON "public"."CommunityMember"("communityId", "status", "role");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityMember_communityId_userId_key" ON "public"."CommunityMember"("communityId", "userId");

-- CreateIndex
CREATE INDEX "CommunityOwnershipTransfer_toUserId_acceptedAt_declinedAt_idx" ON "public"."CommunityOwnershipTransfer"("toUserId", "acceptedAt", "declinedAt");

-- CreateIndex
CREATE INDEX "CommunityOwnershipTransfer_communityId_createdAt_idx" ON "public"."CommunityOwnershipTransfer"("communityId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."Community" ADD CONSTRAINT "Community_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Community" ADD CONSTRAINT "Community_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityMember" ADD CONSTRAINT "CommunityMember_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityMember" ADD CONSTRAINT "CommunityMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityMember" ADD CONSTRAINT "CommunityMember_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityOwnershipTransfer" ADD CONSTRAINT "CommunityOwnershipTransfer_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityOwnershipTransfer" ADD CONSTRAINT "CommunityOwnershipTransfer_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CommunityOwnershipTransfer" ADD CONSTRAINT "CommunityOwnershipTransfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
