-- Сервис «Путешествия», ПР 1: карта мест, объекты размещения и заявки на
-- ночлег, плюс зеркало заявки в «Работе» и колонка настроек уведомлений.
--
-- Написано руками поверх `prisma migrate diff`: diff дополнительно предлагал
-- снести trgm-индексы Библиотеки, tsvector-индекс поиска, индекс автора
-- пояснения в «Мотивации» и дефолты массивов, заданные сырым SQL, — он их не
-- видит в датамодели. См. docs/prisma-raw-sql-objects.md.

-- CreateEnum
CREATE TYPE "public"."TravelStayKind" AS ENUM ('hotel', 'hostel', 'guesthouse', 'ashram', 'homestay');

-- CreateEnum
CREATE TYPE "public"."TravelStayPayment" AS ENUM ('paid', 'seva', 'both');

-- CreateEnum
CREATE TYPE "public"."TravelStayStatus" AS ENUM ('draft', 'published', 'hidden_by_author', 'removed_by_admin');

-- CreateEnum
CREATE TYPE "public"."TravelCurrency" AS ENUM ('rub', 'usd', 'eur', 'inr');

-- CreateEnum
CREATE TYPE "public"."TravelBookingStatus" AS ENUM ('new_request', 'accepted', 'declined', 'cancelled', 'checked_in', 'completed');

-- CreateEnum
CREATE TYPE "public"."TravelStayManagerRole" AS ENUM ('owner', 'manager');

-- AlterTable
ALTER TABLE "public"."NotificationPreference" ADD COLUMN     "travel" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."WorkTravelBooking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "bookingNumber" INTEGER NOT NULL,
    "stayId" TEXT NOT NULL,
    "stayName" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "WorkTravelBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelPlace" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "region" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "TravelPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelStay" (
    "id" TEXT NOT NULL,
    "placeId" TEXT,
    "kind" "public"."TravelStayKind" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "payment" "public"."TravelStayPayment" NOT NULL DEFAULT 'paid',
    "priceMinor" INTEGER,
    "currency" "public"."TravelCurrency" NOT NULL DEFAULT 'rub',
    "sevaNote" TEXT,
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactPhone" TEXT,
    "publicCode" TEXT NOT NULL,
    "status" "public"."TravelStayStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "TravelStay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelStayManager" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "public"."TravelStayManagerRole" NOT NULL DEFAULT 'manager',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

CONSTRAINT "TravelStayManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelRoom" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "building" TEXT NOT NULL DEFAULT '',
    "number" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 1,
    "priceMinor" INTEGER,

CONSTRAINT "TravelRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelBooking" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "stayId" TEXT NOT NULL,
    "roomId" TEXT,
    "guestUserId" TEXT,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT NOT NULL,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "comment" TEXT,
    "status" "public"."TravelBookingStatus" NOT NULL DEFAULT 'new_request',
    "declineReason" TEXT,
    "totalMinor" INTEGER,
    "currency" "public"."TravelCurrency" NOT NULL DEFAULT 'rub',
    "claimToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),

CONSTRAINT "TravelBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkTravelBooking_userId_status_checkIn_idx" ON "public"."WorkTravelBooking"("userId", "status", "checkIn");

-- CreateIndex
CREATE UNIQUE INDEX "WorkTravelBooking_userId_bookingId_key" ON "public"."WorkTravelBooking"("userId", "bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelPlace_slug_key" ON "public"."TravelPlace"("slug");

-- CreateIndex
CREATE INDEX "TravelPlace_country_name_idx" ON "public"."TravelPlace"("country", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TravelStay_publicCode_key" ON "public"."TravelStay"("publicCode");

-- CreateIndex
CREATE INDEX "TravelStay_status_kind_idx" ON "public"."TravelStay"("status", "kind");

-- CreateIndex
CREATE INDEX "TravelStay_placeId_status_idx" ON "public"."TravelStay"("placeId", "status");

-- CreateIndex
CREATE INDEX "TravelStayManager_userId_idx" ON "public"."TravelStayManager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelStayManager_stayId_userId_key" ON "public"."TravelStayManager"("stayId", "userId");

-- CreateIndex
CREATE INDEX "TravelRoom_stayId_idx" ON "public"."TravelRoom"("stayId");

-- CreateIndex
CREATE UNIQUE INDEX "TravelRoom_stayId_building_number_key" ON "public"."TravelRoom"("stayId", "building", "number");

-- CreateIndex
CREATE UNIQUE INDEX "TravelBooking_number_key" ON "public"."TravelBooking"("number");

-- CreateIndex
CREATE UNIQUE INDEX "TravelBooking_claimToken_key" ON "public"."TravelBooking"("claimToken");

-- CreateIndex
CREATE INDEX "TravelBooking_stayId_status_createdAt_idx" ON "public"."TravelBooking"("stayId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TravelBooking_guestUserId_createdAt_idx" ON "public"."TravelBooking"("guestUserId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."WorkTravelBooking" ADD CONSTRAINT "WorkTravelBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelStay" ADD CONSTRAINT "TravelStay_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "public"."TravelPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelStayManager" ADD CONSTRAINT "TravelStayManager_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "public"."TravelStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelStayManager" ADD CONSTRAINT "TravelStayManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelRoom" ADD CONSTRAINT "TravelRoom_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "public"."TravelStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelBooking" ADD CONSTRAINT "TravelBooking_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "public"."TravelStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelBooking" ADD CONSTRAINT "TravelBooking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."TravelRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelBooking" ADD CONSTRAINT "TravelBooking_guestUserId_fkey" FOREIGN KEY ("guestUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
