-- Сервис «Путешествия», шаблоны записей кассы.
--
-- Написано руками: `prisma migrate diff` предлагает снести индексы, заданные
-- сырым SQL в других сервисах. См. docs/prisma-raw-sql-objects.md.

-- CreateTable
CREATE TABLE "public"."TravelCashTemplate" (
    "id" TEXT NOT NULL,
    "stayId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "public"."TravelCashKind" NOT NULL,
    "amountMinor" INTEGER,
    "categoryId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TravelCashTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TravelCashTemplate_stayId_name_key" ON "public"."TravelCashTemplate"("stayId", "name");

-- CreateIndex
CREATE INDEX "TravelCashTemplate_stayId_categoryId_idx" ON "public"."TravelCashTemplate"("stayId", "categoryId");

-- AddForeignKey
ALTER TABLE "public"."TravelCashTemplate" ADD CONSTRAINT "TravelCashTemplate_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "public"."TravelStay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TravelCashTemplate" ADD CONSTRAINT "TravelCashTemplate_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."TravelCashCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
