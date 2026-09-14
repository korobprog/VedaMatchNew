-- Сервис «Путешествия», клиентская база объекта: карточки гостей и связь
-- записи кассы с гостем и оплаченными сутками.
--
-- Написано руками: `prisma migrate diff` предлагает снести индексы, заданные
-- сырым SQL в других сервисах. См. docs/prisma-raw-sql-objects.md.

-- CreateTable
CREATE TABLE "public"."TravelGuest" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "photoKey" TEXT,
    "keyLabel" TEXT NOT NULL DEFAULT '',
    "roomId" TEXT,
    "personalInfo" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'none',
    "checkInOn" DATE NOT NULL,
    "leftOn" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelGuest_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "public"."TravelCashEntry" ADD COLUMN "guestId" TEXT,
ADD COLUMN "nights" INTEGER;

-- CreateIndex
CREATE INDEX "TravelGuest_stayId_leftOn_idx" ON "public"."TravelGuest"("stayId", "leftOn");

-- CreateIndex
CREATE INDEX "TravelCashEntry_guestId_idx" ON "public"."TravelCashEntry"("guestId");

-- AddForeignKey
ALTER TABLE "public"."TravelGuest" ADD CONSTRAINT "TravelGuest_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "public"."TravelStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelGuest" ADD CONSTRAINT "TravelGuest_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."TravelRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelCashEntry" ADD CONSTRAINT "TravelCashEntry_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "public"."TravelGuest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
