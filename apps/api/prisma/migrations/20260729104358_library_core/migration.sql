-- CreateEnum
CREATE TYPE "public"."LibraryEntryType" AS ENUM ('website', 'article', 'video', 'audio', 'book', 'course', 'app', 'telegram_channel', 'community', 'other');

-- CreateEnum
CREATE TYPE "public"."LibraryEntryStatus" AS ENUM ('published', 'hidden_by_reports', 'removed_by_admin');

-- CreateEnum
CREATE TYPE "public"."LibraryEnrichmentStatus" AS ENUM ('pending', 'queued', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "public"."LibraryCategoryStatus" AS ENUM ('active', 'hidden_by_reports', 'merged', 'removed');

-- CreateTable
CREATE TABLE "public"."LibrarySection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "iconKey" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibrarySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LibraryCategory" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleRu" TEXT,
    "titleEn" TEXT,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "normalizedRu" TEXT NOT NULL DEFAULT '',
    "normalizedEn" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "status" "public"."LibraryCategoryStatus" NOT NULL DEFAULT 'active',
    "mergedIntoId" TEXT,
    "entriesCount" INTEGER NOT NULL DEFAULT 0,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "openReportsCount" INTEGER NOT NULL DEFAULT 0,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LibraryEntry" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlNormalized" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "domain" TEXT NOT NULL,
    "type" "public"."LibraryEntryType" NOT NULL,
    "contentLanguage" VARCHAR(8) NOT NULL DEFAULT 'ru',
    "titleRu" TEXT,
    "titleEn" TEXT,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogSiteName" TEXT,
    "faviconUrl" TEXT,
    "previewKey" TEXT,
    "previewUrl" TEXT,
    "enrichmentStatus" "public"."LibraryEnrichmentStatus" NOT NULL DEFAULT 'pending',
    "enrichmentError" TEXT,
    "enrichedAt" TIMESTAMP(3),
    "httpStatus" INTEGER,
    "lastCheckedAt" TIMESTAMP(3),
    "addedById" TEXT,
    "status" "public"."LibraryEntryStatus" NOT NULL DEFAULT 'published',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "usefulCount" INTEGER NOT NULL DEFAULT 0,
    "notUsefulCount" INTEGER NOT NULL DEFAULT 0,
    "uniqueClickCount" INTEGER NOT NULL DEFAULT 0,
    "bookmarkCount" INTEGER NOT NULL DEFAULT 0,
    "openReportsCount" INTEGER NOT NULL DEFAULT 0,
    "rankScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."LibraryEntryCategory" (
    "entryId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryEntryCategory_pkey" PRIMARY KEY ("entryId","categoryId")
);

-- CreateTable
CREATE TABLE "public"."LibraryPreference" (
    "userId" TEXT NOT NULL,
    "uiLanguage" VARCHAR(8) NOT NULL DEFAULT 'ru',
    "contentLanguages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "LibrarySection_slug_key" ON "public"."LibrarySection"("slug");

-- CreateIndex
CREATE INDEX "LibrarySection_position_idx" ON "public"."LibrarySection"("position");

-- CreateIndex
CREATE INDEX "LibraryCategory_sectionId_status_idx" ON "public"."LibraryCategory"("sectionId", "status");

-- CreateIndex
CREATE INDEX "LibraryCategory_status_entriesCount_idx" ON "public"."LibraryCategory"("status", "entriesCount");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryCategory_sectionId_slug_key" ON "public"."LibraryCategory"("sectionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryEntry_urlNormalized_key" ON "public"."LibraryEntry"("urlNormalized");

-- CreateIndex
CREATE INDEX "LibraryEntry_status_publishedAt_idx" ON "public"."LibraryEntry"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "LibraryEntry_status_rankScore_idx" ON "public"."LibraryEntry"("status", "rankScore" DESC);

-- CreateIndex
CREATE INDEX "LibraryEntry_type_idx" ON "public"."LibraryEntry"("type");

-- CreateIndex
CREATE INDEX "LibraryEntry_contentLanguage_idx" ON "public"."LibraryEntry"("contentLanguage");

-- CreateIndex
CREATE INDEX "LibraryEntry_domain_idx" ON "public"."LibraryEntry"("domain");

-- CreateIndex
CREATE INDEX "LibraryEntry_addedById_idx" ON "public"."LibraryEntry"("addedById");

-- CreateIndex
CREATE INDEX "LibraryEntryCategory_categoryId_idx" ON "public"."LibraryEntryCategory"("categoryId");

-- AddForeignKey
ALTER TABLE "public"."LibraryCategory" ADD CONSTRAINT "LibraryCategory_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "public"."LibrarySection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LibraryCategory" ADD CONSTRAINT "LibraryCategory_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LibraryCategory" ADD CONSTRAINT "LibraryCategory_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "public"."LibraryCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LibraryEntry" ADD CONSTRAINT "LibraryEntry_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LibraryEntryCategory" ADD CONSTRAINT "LibraryEntryCategory_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."LibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LibraryEntryCategory" ADD CONSTRAINT "LibraryEntryCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."LibraryCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LibraryPreference" ADD CONSTRAINT "LibraryPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Расширения для поиска и подсказки дублей
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Полнотекстовый вектор: русская и английская части объединяются
ALTER TABLE "LibraryEntry"
  ADD COLUMN "searchVector" tsvector GENERATED ALWAYS AS (
    to_tsvector('russian', coalesce("titleRu", '') || ' ' || coalesce("descriptionRu", '')) ||
    to_tsvector('english', coalesce("titleEn", '') || ' ' || coalesce("descriptionEn", ''))
  ) STORED;

CREATE INDEX "LibraryEntry_searchVector_idx" ON "LibraryEntry" USING GIN ("searchVector");

-- Подсказка похожих категорий
CREATE INDEX "LibraryCategory_normalizedRu_trgm_idx" ON "LibraryCategory" USING GIN ("normalizedRu" gin_trgm_ops);
CREATE INDEX "LibraryCategory_normalizedEn_trgm_idx" ON "LibraryCategory" USING GIN ("normalizedEn" gin_trgm_ops);
