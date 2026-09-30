-- Маршруты народной карты: парикрамы, тропы, прогулки, экскурсии и их
-- остановки. См. docs/travel-service-plan.md.

-- CreateEnum
CREATE TYPE "public"."TravelMapRouteKind" AS ENUM ('parikrama', 'trail', 'city_walk', 'excursion');

-- CreateEnum
CREATE TYPE "public"."TravelMapRouteStatus" AS ENUM ('active', 'hidden');

-- CreateTable
CREATE TABLE "public"."TravelMapRoute" (
    "id" TEXT NOT NULL,
    "kind" "public"."TravelMapRouteKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "city" TEXT,
    "country" TEXT,
    "stopsCount" INTEGER NOT NULL DEFAULT 0,
    "distanceKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "startLat" DOUBLE PRECISION NOT NULL,
    "startLng" DOUBLE PRECISION NOT NULL,
    "status" "public"."TravelMapRouteStatus" NOT NULL DEFAULT 'active',
    "hiddenReason" TEXT,
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelMapRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelMapRouteStop" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "placeId" TEXT,
    "position" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "TravelMapRouteStop_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelMapRoute_status_startLat_startLng_idx" ON "public"."TravelMapRoute"("status", "startLat", "startLng");

-- CreateIndex
CREATE INDEX "TravelMapRoute_status_kind_idx" ON "public"."TravelMapRoute"("status", "kind");

-- CreateIndex
CREATE INDEX "TravelMapRoute_authorId_idx" ON "public"."TravelMapRoute"("authorId");

-- CreateIndex
CREATE INDEX "TravelMapRouteStop_placeId_idx" ON "public"."TravelMapRouteStop"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelMapRouteStop_routeId_position_key" ON "public"."TravelMapRouteStop"("routeId", "position");

-- AddForeignKey
ALTER TABLE "public"."TravelMapRoute" ADD CONSTRAINT "TravelMapRoute_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapRouteStop" ADD CONSTRAINT "TravelMapRouteStop_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."TravelMapRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapRouteStop" ADD CONSTRAINT "TravelMapRouteStop_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "public"."TravelMapPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

