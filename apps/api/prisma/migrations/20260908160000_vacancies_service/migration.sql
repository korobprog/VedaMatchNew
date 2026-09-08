-- Сервис «Вакансии»: предложения трёх видов, отклики, жалобы. См. VED-24.

-- CreateEnum
CREATE TYPE "public"."VacancyKind" AS ENUM ('work', 'seva', 'task');

-- CreateEnum
CREATE TYPE "public"."VacancyStatus" AS ENUM ('draft', 'published', 'hidden_by_author', 'closed', 'expired', 'hidden_by_reports', 'removed_by_admin');

-- CreateEnum
CREATE TYPE "public"."VacancyAudience" AS ENUM ('everyone', 'my_city', 'my_community');

-- CreateEnum
CREATE TYPE "public"."VacancyPlacePrecision" AS ENUM ('exact', 'city');

-- CreateEnum
CREATE TYPE "public"."VacancyWorkFormat" AS ENUM ('onsite', 'remote', 'hybrid');

-- CreateEnum
CREATE TYPE "public"."VacancyEmployment" AS ENUM ('full_time', 'part_time', 'project', 'shift');

-- CreateEnum
CREATE TYPE "public"."VacancyPayPeriod" AS ENUM ('month', 'day', 'hour', 'task');

-- CreateEnum
CREATE TYPE "public"."VacancySevaTerm" AS ENUM ('ongoing', 'until', 'event');

-- CreateEnum
CREATE TYPE "public"."VacancyPerk" AS ENUM ('prasad', 'housing', 'travel', 'stipend');

-- CreateEnum
CREATE TYPE "public"."VacancyResponseStatus" AS ENUM ('new', 'in_dialog', 'accepted', 'declined', 'withdrawn');

-- CreateEnum
CREATE TYPE "public"."VacancyReportReason" AS ENUM ('spam', 'scam', 'misleading', 'not_community', 'inappropriate_content', 'duplicate', 'other');

-- CreateEnum
CREATE TYPE "public"."VacancyReportStatus" AS ENUM ('open', 'reviewed', 'dismissed');

-- CreateTable
CREATE TABLE "public"."VacancyOffer" (
    "id" TEXT NOT NULL,
    "kind" "public"."VacancyKind" NOT NULL,
    "authorId" TEXT NOT NULL,
    "communityId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "audience" "public"."VacancyAudience" NOT NULL DEFAULT 'everyone',
    "location" JSONB,
    "city" TEXT,
    "cityKey" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "placePrecision" "public"."VacancyPlacePrecision" NOT NULL DEFAULT 'city',
    "isRemote" BOOLEAN NOT NULL DEFAULT false,
    "workFormat" "public"."VacancyWorkFormat",
    "employment" "public"."VacancyEmployment",
    "schedule" TEXT,
    "payMin" INTEGER,
    "payMax" INTEGER,
    "payCurrency" TEXT NOT NULL DEFAULT 'RUB',
    "payPeriod" "public"."VacancyPayPeriod",
    "payNegotiable" BOOLEAN NOT NULL DEFAULT false,
    "sevaTerm" "public"."VacancySevaTerm",
    "sevaUntil" TIMESTAMP(3),
    "perks" "public"."VacancyPerk"[],
    "dueAt" TIMESTAMP(3),
    "status" "public"."VacancyStatus" NOT NULL DEFAULT 'published',
    "moderatorNote" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "renewedAt" TIMESTAMP(3),
    "renewCount" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "responsesCount" INTEGER NOT NULL DEFAULT 0,
    "openReportsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VacancyOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VacancyResponse" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "status" "public"."VacancyResponseStatus" NOT NULL DEFAULT 'new',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "VacancyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VacancyReport" (
    "id" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" "public"."VacancyReportReason" NOT NULL,
    "note" TEXT,
    "status" "public"."VacancyReportStatus" NOT NULL DEFAULT 'open',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacancyOffer_status_publishedAt_idx" ON "public"."VacancyOffer"("status", "publishedAt" DESC);
CREATE INDEX "VacancyOffer_status_kind_publishedAt_idx" ON "public"."VacancyOffer"("status", "kind", "publishedAt" DESC);
CREATE INDEX "VacancyOffer_status_cityKey_publishedAt_idx" ON "public"."VacancyOffer"("status", "cityKey", "publishedAt" DESC);
CREATE INDEX "VacancyOffer_status_isRemote_publishedAt_idx" ON "public"."VacancyOffer"("status", "isRemote", "publishedAt" DESC);
CREATE INDEX "VacancyOffer_status_expiresAt_idx" ON "public"."VacancyOffer"("status", "expiresAt");
CREATE INDEX "VacancyOffer_communityId_status_publishedAt_idx" ON "public"."VacancyOffer"("communityId", "status", "publishedAt" DESC);
CREATE INDEX "VacancyOffer_authorId_status_createdAt_idx" ON "public"."VacancyOffer"("authorId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "VacancyResponse_offerId_userId_key" ON "public"."VacancyResponse"("offerId", "userId");
CREATE INDEX "VacancyResponse_offerId_status_createdAt_idx" ON "public"."VacancyResponse"("offerId", "status", "createdAt");
CREATE INDEX "VacancyResponse_userId_createdAt_idx" ON "public"."VacancyResponse"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "VacancyReport_reporterId_offerId_key" ON "public"."VacancyReport"("reporterId", "offerId");
CREATE INDEX "VacancyReport_status_createdAt_idx" ON "public"."VacancyReport"("status", "createdAt");
CREATE INDEX "VacancyReport_offerId_status_idx" ON "public"."VacancyReport"("offerId", "status");

-- AddForeignKey
ALTER TABLE "public"."VacancyOffer" ADD CONSTRAINT "VacancyOffer_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."VacancyOffer" ADD CONSTRAINT "VacancyOffer_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."Community"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."VacancyResponse" ADD CONSTRAINT "VacancyResponse_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."VacancyOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."VacancyResponse" ADD CONSTRAINT "VacancyResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."VacancyReport" ADD CONSTRAINT "VacancyReport_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "public"."VacancyOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."VacancyReport" ADD CONSTRAINT "VacancyReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."VacancyReport" ADD CONSTRAINT "VacancyReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
