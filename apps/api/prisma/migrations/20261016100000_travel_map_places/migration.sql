-- Народная карта мест подсервиса «Карта» в «Путешествиях»: места, которые
-- отмечают люди портала, и жалобы на них. См. docs/travel-service-plan.md.

-- CreateEnum
CREATE TYPE "public"."TravelMapPlaceKind" AS ENUM ('temple', 'math', 'nama_hatta', 'bhakti_vriksha', 'ashram', 'farm', 'holy_place', 'cafe', 'shop', 'eco_shop', 'prasadam', 'harinam_spot', 'sankirtana_spot', 'other');

-- CreateEnum
CREATE TYPE "public"."TravelMapPlaceStatus" AS ENUM ('active', 'hidden');

-- CreateEnum
CREATE TYPE "public"."TravelMapReportStatus" AS ENUM ('open', 'resolved');

-- CreateTable
CREATE TABLE "public"."TravelMapPlace" (
    "id" TEXT NOT NULL,
    "kind" "public"."TravelMapPlaceKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "lineage" TEXT,
    "openingHours" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "telegram" TEXT,
    "photoKeys" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "public"."TravelMapPlaceStatus" NOT NULL DEFAULT 'active',
    "hiddenReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelMapPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelMapPlaceReport" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "public"."TravelMapReportStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelMapPlaceReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelMapPlace_status_lat_lng_idx" ON "public"."TravelMapPlace"("status", "lat", "lng");

-- CreateIndex
CREATE INDEX "TravelMapPlace_status_kind_idx" ON "public"."TravelMapPlace"("status", "kind");

-- CreateIndex
CREATE INDEX "TravelMapPlace_createdById_idx" ON "public"."TravelMapPlace"("createdById");

-- CreateIndex
CREATE INDEX "TravelMapPlaceReport_status_createdAt_idx" ON "public"."TravelMapPlaceReport"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TravelMapPlaceReport_placeId_idx" ON "public"."TravelMapPlaceReport"("placeId");

-- AddForeignKey
ALTER TABLE "public"."TravelMapPlace" ADD CONSTRAINT "TravelMapPlace_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapPlace" ADD CONSTRAINT "TravelMapPlace_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapPlaceReport" ADD CONSTRAINT "TravelMapPlaceReport_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "public"."TravelMapPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapPlaceReport" ADD CONSTRAINT "TravelMapPlaceReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

