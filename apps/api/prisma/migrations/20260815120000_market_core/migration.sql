-- CreateEnum
CREATE TYPE "public"."MarketListingKind" AS ENUM ('product', 'service');

-- CreateEnum
CREATE TYPE "public"."MarketListingStatus" AS ENUM ('draft', 'published', 'hidden_by_author', 'sold_out', 'hidden_by_reports', 'removed_by_admin');

-- CreateEnum
CREATE TYPE "public"."MarketListingCondition" AS ENUM ('new_item', 'like_new', 'used', 'refurbished');

-- CreateEnum
CREATE TYPE "public"."MarketPriceMode" AS ENUM ('fixed', 'from', 'negotiable', 'free');

-- CreateEnum
CREATE TYPE "public"."MarketCurrency" AS ENUM ('rub', 'usd', 'eur', 'inr');

-- CreateEnum
CREATE TYPE "public"."MarketDeliveryOption" AS ENUM ('pickup', 'courier', 'post', 'cdek', 'digital', 'shipping_worldwide');

-- CreateEnum
CREATE TYPE "public"."MarketServiceFormat" AS ENUM ('online', 'offline', 'any');

-- CreateEnum
CREATE TYPE "public"."MarketShopStatus" AS ENUM ('active', 'closed', 'hidden_by_reports', 'blocked_by_admin');

-- AlterTable

-- CreateTable
CREATE TABLE "public"."MarketSection" (
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

    CONSTRAINT "MarketSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketCategory" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "listingsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketShop" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taglineRu" TEXT,
    "taglineEn" TEXT,
    "aboutRu" TEXT,
    "aboutEn" TEXT,
    "logoKey" TEXT,
    "logoUrl" TEXT,
    "coverKey" TEXT,
    "coverUrl" TEXT,
    "location" JSONB,
    "city" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "messengers" JSONB,
    "deliveryOptions" "public"."MarketDeliveryOption"[],
    "status" "public"."MarketShopStatus" NOT NULL DEFAULT 'active',
    "rulesAcceptedAt" TIMESTAMP(3),
    "listingsCount" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "reviewsCount" INTEGER NOT NULL DEFAULT 0,
    "ratingSum" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "followersCount" INTEGER NOT NULL DEFAULT 0,
    "openReportsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketShop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketShelf" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleRu" TEXT,
    "titleEn" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "listingsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketShelf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketListing" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "kind" "public"."MarketListingKind" NOT NULL,
    "titleRu" TEXT,
    "titleEn" TEXT,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "priceMode" "public"."MarketPriceMode" NOT NULL DEFAULT 'fixed',
    "priceMinor" INTEGER,
    "priceMaxMinor" INTEGER,
    "currency" "public"."MarketCurrency" NOT NULL DEFAULT 'rub',
    "condition" "public"."MarketListingCondition",
    "quantity" INTEGER,
    "trackStock" BOOLEAN NOT NULL DEFAULT false,
    "soldCount" INTEGER NOT NULL DEFAULT 0,
    "serviceFormat" "public"."MarketServiceFormat",
    "serviceDurationMinutes" INTEGER,
    "location" JSONB,
    "city" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "deliveryOptions" "public"."MarketDeliveryOption"[],
    "status" "public"."MarketListingStatus" NOT NULL DEFAULT 'published',
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "primaryImageUrl" TEXT,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "favoritesCount" INTEGER NOT NULL DEFAULT 0,
    "commentsCount" INTEGER NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "openReportsCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketListingImage" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketListingImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MarketListingCategory" (
    "listingId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketListingCategory_pkey" PRIMARY KEY ("listingId","categoryId")
);

-- CreateTable
CREATE TABLE "public"."MarketListingShelf" (
    "listingId" TEXT NOT NULL,
    "shelfId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "MarketListingShelf_pkey" PRIMARY KEY ("listingId","shelfId")
);

-- CreateTable
CREATE TABLE "public"."MarketFavorite" (
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "priceAtFavorite" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketFavorite_pkey" PRIMARY KEY ("userId","listingId")
);

-- CreateTable
CREATE TABLE "public"."MarketPreference" (
    "userId" TEXT NOT NULL,
    "uiLanguage" VARCHAR(8) NOT NULL DEFAULT 'ru',
    "displayCurrency" "public"."MarketCurrency" NOT NULL DEFAULT 'rub',
    "priceDropAlerts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketSection_slug_key" ON "public"."MarketSection"("slug");

-- CreateIndex
CREATE INDEX "MarketSection_position_idx" ON "public"."MarketSection"("position");

-- CreateIndex
CREATE INDEX "MarketCategory_sectionId_position_idx" ON "public"."MarketCategory"("sectionId", "position");

-- CreateIndex
CREATE INDEX "MarketCategory_listingsCount_idx" ON "public"."MarketCategory"("listingsCount" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketCategory_sectionId_slug_key" ON "public"."MarketCategory"("sectionId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "MarketShop_ownerId_key" ON "public"."MarketShop"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketShop_slug_key" ON "public"."MarketShop"("slug");

-- CreateIndex
CREATE INDEX "MarketShop_status_createdAt_idx" ON "public"."MarketShop"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MarketShop_status_ratingAvg_idx" ON "public"."MarketShop"("status", "ratingAvg" DESC);

-- CreateIndex
CREATE INDEX "MarketShop_city_idx" ON "public"."MarketShop"("city");

-- CreateIndex
CREATE INDEX "MarketShelf_shopId_position_idx" ON "public"."MarketShelf"("shopId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MarketShelf_shopId_slug_key" ON "public"."MarketShelf"("shopId", "slug");

-- CreateIndex
CREATE INDEX "MarketListing_status_publishedAt_idx" ON "public"."MarketListing"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "MarketListing_shopId_status_publishedAt_idx" ON "public"."MarketListing"("shopId", "status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "MarketListing_status_kind_publishedAt_idx" ON "public"."MarketListing"("status", "kind", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "MarketListing_status_currency_priceMinor_idx" ON "public"."MarketListing"("status", "currency", "priceMinor");

-- CreateIndex
CREATE INDEX "MarketListing_status_city_idx" ON "public"."MarketListing"("status", "city");

-- CreateIndex
CREATE INDEX "MarketListing_status_favoritesCount_idx" ON "public"."MarketListing"("status", "favoritesCount" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "MarketListingImage_storageKey_key" ON "public"."MarketListingImage"("storageKey");

-- CreateIndex
CREATE INDEX "MarketListingImage_listingId_sortOrder_idx" ON "public"."MarketListingImage"("listingId", "sortOrder");

-- CreateIndex
CREATE INDEX "MarketListingCategory_categoryId_idx" ON "public"."MarketListingCategory"("categoryId");

-- CreateIndex
CREATE INDEX "MarketListingShelf_shelfId_position_idx" ON "public"."MarketListingShelf"("shelfId", "position");

-- CreateIndex
CREATE INDEX "MarketFavorite_listingId_idx" ON "public"."MarketFavorite"("listingId");

-- CreateIndex
CREATE INDEX "MarketFavorite_userId_createdAt_idx" ON "public"."MarketFavorite"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."MarketCategory" ADD CONSTRAINT "MarketCategory_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "public"."MarketSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketShop" ADD CONSTRAINT "MarketShop_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketShelf" ADD CONSTRAINT "MarketShelf_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."MarketShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketListing" ADD CONSTRAINT "MarketListing_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "public"."MarketShop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketListingImage" ADD CONSTRAINT "MarketListingImage_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketListingCategory" ADD CONSTRAINT "MarketListingCategory_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketListingCategory" ADD CONSTRAINT "MarketListingCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."MarketCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketListingShelf" ADD CONSTRAINT "MarketListingShelf_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketListingShelf" ADD CONSTRAINT "MarketListingShelf_shelfId_fkey" FOREIGN KEY ("shelfId") REFERENCES "public"."MarketShelf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketFavorite" ADD CONSTRAINT "MarketFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketFavorite" ADD CONSTRAINT "MarketFavorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "public"."MarketListing"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MarketPreference" ADD CONSTRAINT "MarketPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
