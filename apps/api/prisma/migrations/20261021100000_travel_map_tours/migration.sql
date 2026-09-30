-- Экскурсоводы и наборы на дату народной карты. См. docs/travel-service-plan.md.

-- CreateEnum
CREATE TYPE "public"."TravelMapTourPayment" AS ENUM ('free', 'seva', 'paid');

-- CreateEnum
CREATE TYPE "public"."TravelMapTourStatus" AS ENUM ('scheduled', 'cancelled', 'done');

-- CreateTable
CREATE TABLE "public"."TravelMapGuide" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "about" TEXT NOT NULL DEFAULT '',
    "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "telegram" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelMapGuide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelMapTour" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "routeId" TEXT,
    "routeName" TEXT NOT NULL,
    "city" TEXT,
    "guideId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT,
    "meetingPoint" TEXT NOT NULL DEFAULT '',
    "capacity" INTEGER,
    "payment" "public"."TravelMapTourPayment" NOT NULL DEFAULT 'free',
    "priceMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'rub',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "public"."TravelMapTourStatus" NOT NULL DEFAULT 'scheduled',
    "participantsCount" INTEGER NOT NULL DEFAULT 0,
    "chatConversationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelMapTour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelMapTourParticipant" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelMapTourParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelMapGuide_userId_key" ON "public"."TravelMapGuide"("userId");

-- CreateIndex
CREATE INDEX "TravelMapTour_status_startsAt_idx" ON "public"."TravelMapTour"("status", "startsAt");

-- CreateIndex
CREATE INDEX "TravelMapTour_guideId_startsAt_idx" ON "public"."TravelMapTour"("guideId", "startsAt");

-- CreateIndex
CREATE INDEX "TravelMapTour_routeId_idx" ON "public"."TravelMapTour"("routeId");

-- CreateIndex
CREATE INDEX "TravelMapTourParticipant_userId_idx" ON "public"."TravelMapTourParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelMapTourParticipant_tourId_userId_key" ON "public"."TravelMapTourParticipant"("tourId", "userId");

-- AddForeignKey
ALTER TABLE "public"."TravelMapGuide" ADD CONSTRAINT "TravelMapGuide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapTour" ADD CONSTRAINT "TravelMapTour_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "public"."TravelMapRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapTour" ADD CONSTRAINT "TravelMapTour_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapTourParticipant" ADD CONSTRAINT "TravelMapTourParticipant_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "public"."TravelMapTour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapTourParticipant" ADD CONSTRAINT "TravelMapTourParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

