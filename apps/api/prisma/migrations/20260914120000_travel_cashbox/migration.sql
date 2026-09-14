-- Сервис «Путешествия», касса объекта: статьи и записи доходов и расходов,
-- плюс начальный остаток у самого объекта.
--
-- Написано руками, а не `prisma migrate diff` целиком: diff предлагает снести
-- индексы, заданные сырым SQL в других сервисах. См.
-- docs/prisma-raw-sql-objects.md.

-- CreateEnum
CREATE TYPE "public"."TravelCashKind" AS ENUM ('income', 'expense');

-- AlterTable
ALTER TABLE "public"."TravelStay" ADD COLUMN "cashOpeningMinor" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."TravelCashCategory" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "kind" "public"."TravelCashKind" NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelCashCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TravelCashEntry" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "kind" "public"."TravelCashKind" NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "occurredOn" DATE NOT NULL,
    "categoryId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelCashEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelCashCategory_stayId_kind_name_key" ON "public"."TravelCashCategory"("stayId", "kind", "name");

-- CreateIndex
CREATE INDEX "TravelCashCategory_stayId_kind_position_idx" ON "public"."TravelCashCategory"("stayId", "kind", "position");

-- CreateIndex
CREATE INDEX "TravelCashEntry_stayId_occurredOn_idx" ON "public"."TravelCashEntry"("stayId", "occurredOn" DESC);

-- CreateIndex
CREATE INDEX "TravelCashEntry_categoryId_idx" ON "public"."TravelCashEntry"("categoryId");

-- AddForeignKey
ALTER TABLE "public"."TravelCashCategory" ADD CONSTRAINT "TravelCashCategory_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "public"."TravelStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelCashEntry" ADD CONSTRAINT "TravelCashEntry_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "public"."TravelStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelCashEntry" ADD CONSTRAINT "TravelCashEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."TravelCashCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelCashEntry" ADD CONSTRAINT "TravelCashEntry_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
