-- CreateEnum
CREATE TYPE "public"."NoticeKind" AS ENUM ('offer', 'request', 'event', 'info');

-- CreateEnum
CREATE TYPE "public"."NoticeStatus" AS ENUM ('draft', 'published', 'hidden_by_author', 'resolved', 'expired', 'moved_to_market', 'hidden_by_reports', 'removed_by_admin');

-- CreateEnum
CREATE TYPE "public"."NoticePlacePrecision" AS ENUM ('exact', 'city');

-- CreateEnum
CREATE TYPE "public"."NoticeAudience" AS ENUM ('everyone', 'my_city', 'my_community');

-- CreateTable
CREATE TABLE "public"."NoticeRubric" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kinds" "public"."NoticeKind"[],
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "iconKey" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "noticesCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoticeRubric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Notice" (
    "id" TEXT NOT NULL,
    "kind" "public"."NoticeKind" NOT NULL,
    "rubricId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "communityId" TEXT,
    "titleRu" TEXT,
    "titleEn" TEXT,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "audience" "public"."NoticeAudience" NOT NULL DEFAULT 'everyone',
    "location" JSONB,
    "city" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "placePrecision" "public"."NoticePlacePrecision" NOT NULL DEFAULT 'city',
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "timeZone" TEXT,
    "venueName" TEXT,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "onlineUrl" TEXT,
    "status" "public"."NoticeStatus" NOT NULL DEFAULT 'published',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "marketMoveSuggestedAt" TIMESTAMP(3),
    "moderatorNote" TEXT,
    "fingerprint" TEXT NOT NULL,
    "primaryImageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "renewedAt" TIMESTAMP(3),
    "renewCount" INTEGER NOT NULL DEFAULT 0,
    "resolvedAt" TIMESTAMP(3),
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "responsesCount" INTEGER NOT NULL DEFAULT 0,
    "thanksCount" INTEGER NOT NULL DEFAULT 0,
    "openReportsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NoticeImage" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoticeRubric_slug_key" ON "public"."NoticeRubric"("slug");

-- CreateIndex
CREATE INDEX "NoticeRubric_position_idx" ON "public"."NoticeRubric"("position");

-- CreateIndex
CREATE INDEX "NoticeRubric_noticesCount_idx" ON "public"."NoticeRubric"("noticesCount" DESC);

-- CreateIndex
CREATE INDEX "Notice_status_publishedAt_idx" ON "public"."Notice"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Notice_status_kind_publishedAt_idx" ON "public"."Notice"("status", "kind", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Notice_status_rubricId_publishedAt_idx" ON "public"."Notice"("status", "rubricId", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Notice_status_city_publishedAt_idx" ON "public"."Notice"("status", "city", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Notice_status_expiresAt_idx" ON "public"."Notice"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "Notice_status_startsAt_idx" ON "public"."Notice"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Notice_communityId_status_publishedAt_idx" ON "public"."Notice"("communityId", "status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "Notice_authorId_status_createdAt_idx" ON "public"."Notice"("authorId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Notice_authorId_fingerprint_idx" ON "public"."Notice"("authorId", "fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeImage_storageKey_key" ON "public"."NoticeImage"("storageKey");

-- CreateIndex
CREATE INDEX "NoticeImage_noticeId_sortOrder_idx" ON "public"."NoticeImage"("noticeId", "sortOrder");

-- AddForeignKey
ALTER TABLE "public"."Notice" ADD CONSTRAINT "Notice_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "public"."NoticeRubric"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notice" ADD CONSTRAINT "Notice_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Notice" ADD CONSTRAINT "Notice_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeImage" ADD CONSTRAINT "NoticeImage_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "public"."Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
