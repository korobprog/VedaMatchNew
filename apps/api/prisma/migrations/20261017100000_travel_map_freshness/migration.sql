-- Свежесть и заметки народной карты: подтверждения «был здесь / закрылось»
-- и короткие полезные заметки к месту. См. docs/travel-service-plan.md.

-- CreateEnum
CREATE TYPE "public"."TravelMapCheckVerdict" AS ENUM ('confirmed', 'closed');

-- AlterTable
ALTER TABLE "public"."TravelMapPlace" ADD COLUMN     "lastConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "public"."TravelMapCheck" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verdict" "public"."TravelMapCheckVerdict" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelMapCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelMapNote" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "authorId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelMapNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelMapCheck_placeId_verdict_updatedAt_idx" ON "public"."TravelMapCheck"("placeId", "verdict", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TravelMapCheck_placeId_userId_key" ON "public"."TravelMapCheck"("placeId", "userId");

-- CreateIndex
CREATE INDEX "TravelMapNote_placeId_createdAt_idx" ON "public"."TravelMapNote"("placeId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TravelMapNote_authorId_idx" ON "public"."TravelMapNote"("authorId");

-- AddForeignKey
ALTER TABLE "public"."TravelMapCheck" ADD CONSTRAINT "TravelMapCheck_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "public"."TravelMapPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapCheck" ADD CONSTRAINT "TravelMapCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapNote" ADD CONSTRAINT "TravelMapNote_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "public"."TravelMapPlace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelMapNote" ADD CONSTRAINT "TravelMapNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

