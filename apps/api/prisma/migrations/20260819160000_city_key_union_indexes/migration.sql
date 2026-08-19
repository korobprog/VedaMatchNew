-- Нормализованный город `cityKey` (lower(trim(city))) для фильтров по равенству.
-- Prisma для `{ equals, mode: 'insensitive' }` генерирует ILIKE и не использует
-- ни btree по "city", ни expression-индексы по lower("city"); поэтому фильтры
-- переведены на `cityKey = $1`, а старые expression-индексы из
-- 20260819150000_city_lower_indexes удаляются.

-- AlterTable
ALTER TABLE "public"."Notice" ADD COLUMN "cityKey" TEXT;
ALTER TABLE "public"."MarketListing" ADD COLUMN "cityKey" TEXT;
ALTER TABLE "public"."MarketShop" ADD COLUMN "cityKey" TEXT;
ALTER TABLE "public"."Community" ADD COLUMN "cityKey" TEXT;

-- Backfill (пустая строка после trim — NULL, как в normalizeCityKey)
UPDATE "public"."Notice" SET "cityKey" = NULLIF(lower(trim("city")), '') WHERE "city" IS NOT NULL;
UPDATE "public"."MarketListing" SET "cityKey" = NULLIF(lower(trim("city")), '') WHERE "city" IS NOT NULL;
UPDATE "public"."MarketShop" SET "cityKey" = NULLIF(lower(trim("city")), '') WHERE "city" IS NOT NULL;
UPDATE "public"."Community" SET "cityKey" = NULLIF(lower(trim("city")), '') WHERE "city" IS NOT NULL;

-- CreateIndex
CREATE INDEX "Notice_status_cityKey_publishedAt_idx" ON "public"."Notice"("status", "cityKey", "publishedAt" DESC);
CREATE INDEX "MarketListing_status_cityKey_idx" ON "public"."MarketListing"("status", "cityKey");
CREATE INDEX "MarketShop_status_cityKey_idx" ON "public"."MarketShop"("status", "cityKey");
CREATE INDEX "Community_status_cityKey_idx" ON "public"."Community"("status", "cityKey");

-- DropIndex: expression-индексы по lower("city") больше не нужны
DROP INDEX IF EXISTS "public"."Notice_status_city_lower_idx";
DROP INDEX IF EXISTS "public"."MarketListing_status_city_lower_idx";
DROP INDEX IF EXISTS "public"."MarketShop_status_city_lower_idx";
DROP INDEX IF EXISTS "public"."Community_status_city_lower_idx";

-- Union: рекомендации фильтруются в БД по активности анкеты и статусу/возрасту пользователя
CREATE INDEX "UnionProfile_isActive_idx" ON "public"."UnionProfile"("isActive");
CREATE INDEX "User_accountStatus_idx" ON "public"."User"("accountStatus");
CREATE INDEX "User_birthDate_idx" ON "public"."User"("birthDate");
