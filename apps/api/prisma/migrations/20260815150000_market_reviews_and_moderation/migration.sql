-- CreateEnum
CREATE TYPE "public"."MarketReviewStatus" AS ENUM ('published', 'removed_by_author', 'removed_by_admin');

-- CreateEnum
CREATE TYPE "public"."MarketCommentStatus" AS ENUM ('published', 'removed_by_author', 'removed_by_admin');

-- CreateEnum
CREATE TYPE "public"."MarketSubscriptionKind" AS ENUM ('shop', 'section', 'category', 'saved_search');

-- CreateEnum
CREATE TYPE "public"."MarketReportTargetKind" AS ENUM ('listing', 'shop', 'comment', 'review');

-- CreateEnum
CREATE TYPE "public"."MarketReportReason" AS ENUM ('spam', 'prohibited_item', 'scam', 'wrong_category', 'inappropriate_content', 'other');

-- CreateEnum
CREATE TYPE "public"."MarketReportStatus" AS ENUM ('open', 'reviewed', 'dismissed');

-- AlterTable

-- CreateTable
CREATE TABLE "public"."MarketReview" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "listingId" TEXT,
    "authorId" TEXT,
    "rating" INTEGER NOT NULL,
    "body" TEXT,
    "status" "public"."MarketReviewStatus" NOT NULL DEFAULT 'published',
    "openReportsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketListingComment" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "userId" TEXT,
    "body" TEXT NOT NULL,
    "status" "public"."MarketCommentStatus" NOT NULL DEFAULT 'published',
    "openReportsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketListingComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "public"."MarketSubscriptionKind" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "shopId" TEXT,
    "sectionId" TEXT,
    "categoryId" TEXT,
    "query" JSONB,
    "title" TEXT,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "targetKind" "public"."MarketReportTargetKind" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "listingId" TEXT,
    "shopId" TEXT,
    "commentId" TEXT,
    "reviewId" TEXT,
    "reason" "public"."MarketReportReason" NOT NULL,
    "note" TEXT,
    "status" "public"."MarketReportStatus" NOT NULL DEFAULT 'open',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "moderatorNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketReview_orderId_key" ON "public"."MarketReview"("orderId");

-- CreateIndex
CREATE INDEX "MarketReview_shopId_status_createdAt_idx" ON "public"."MarketReview"("shopId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketReview_authorId_idx" ON "public"."MarketReview"("authorId");

-- CreateIndex
CREATE INDEX "MarketListingComment_listingId_createdAt_idx" ON "public"."MarketListingComment"("listingId", "createdAt");

-- CreateIndex
CREATE INDEX "MarketListingComment_userId_idx" ON "public"."MarketListingComment"("userId");

-- CreateIndex
CREATE INDEX "MarketSubscription_kind_targetKey_idx" ON "public"."MarketSubscription"("kind", "targetKey");

-- CreateIndex
CREATE INDEX "MarketSubscription_userId_createdAt_idx" ON "public"."MarketSubscription"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketSubscription_userId_kind_targetKey_key" ON "public"."MarketSubscription"("userId", "kind", "targetKey");

-- CreateIndex
CREATE INDEX "MarketReport_status_createdAt_idx" ON "public"."MarketReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MarketReport_listingId_idx" ON "public"."MarketReport"("listingId");

-- CreateIndex
CREATE INDEX "MarketReport_shopId_idx" ON "public"."MarketReport"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketReport_reporterId_targetKey_key" ON "public"."MarketReport"("reporterId", "targetKey");

-- AddForeignKey
ALTER TABLE "public"."MarketReview" ADD CONSTRAINT "MarketReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."MarketOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketReview" ADD CONSTRAINT "MarketReview_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."MarketShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketReview" ADD CONSTRAINT "MarketReview_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketReview" ADD CONSTRAINT "MarketReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketListingComment" ADD CONSTRAINT "MarketListingComment_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketListingComment" ADD CONSTRAINT "MarketListingComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketSubscription" ADD CONSTRAINT "MarketSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketSubscription" ADD CONSTRAINT "MarketSubscription_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."MarketShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketSubscription" ADD CONSTRAINT "MarketSubscription_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "public"."MarketSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketSubscription" ADD CONSTRAINT "MarketSubscription_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."MarketCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketReport" ADD CONSTRAINT "MarketReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketReport" ADD CONSTRAINT "MarketReport_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketReport" ADD CONSTRAINT "MarketReport_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."MarketShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketReport" ADD CONSTRAINT "MarketReport_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "public"."MarketListingComment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketReport" ADD CONSTRAINT "MarketReport_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "public"."MarketReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketReport" ADD CONSTRAINT "MarketReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
