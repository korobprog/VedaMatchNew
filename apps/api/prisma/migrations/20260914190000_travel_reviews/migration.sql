-- Сервис «Путешествия», отзывы о проживании: один на заявку, после заезда.
--
-- Написано руками: `prisma migrate diff` предлагает снести индексы, заданные
-- сырым SQL в других сервисах. См. docs/prisma-raw-sql-objects.md.

-- CreateEnum
CREATE TYPE "public"."TravelReviewStatus" AS ENUM ('published', 'hidden_by_admin');

-- CreateTable
CREATE TABLE "public"."TravelReview" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "authorId" TEXT,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "status" "public"."TravelReviewStatus" NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelReview_bookingId_key" ON "public"."TravelReview"("bookingId");

-- CreateIndex
CREATE INDEX "TravelReview_stayId_status_createdAt_idx" ON "public"."TravelReview"("stayId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TravelReview_authorId_idx" ON "public"."TravelReview"("authorId");

-- AddForeignKey
ALTER TABLE "public"."TravelReview" ADD CONSTRAINT "TravelReview_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "public"."TravelStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelReview" ADD CONSTRAINT "TravelReview_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "public"."TravelBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelReview" ADD CONSTRAINT "TravelReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
