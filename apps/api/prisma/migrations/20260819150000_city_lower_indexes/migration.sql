-- Expression-индексы по lower("city") для регистронезависимого поиска по городу
-- (Notice, MarketListing, MarketShop, Community). Обычный btree по "city" при
-- сравнении без учёта регистра не используется. Индексы не описаны в
-- schema.prisma — см. docs/prisma-raw-sql-objects.md, не дайте `migrate dev`
-- их удалить.
--
-- ВАЖНО: Prisma для `{ equals, mode: 'insensitive' }` генерирует `"city" ILIKE $1`,
-- а не `lower("city") = lower($1)`, поэтому планировщик возьмёт эти индексы только
-- у запросов вида `lower("city") = lower(:city)` (raw SQL) или после перехода на
-- нормализованную колонку cityKey. Текущие ORM-запросы продолжают работать как
-- прежде, просто пока без индекса.
CREATE INDEX "Notice_status_city_lower_idx" ON "public"."Notice"("status", lower("city"));
CREATE INDEX "MarketListing_status_city_lower_idx" ON "public"."MarketListing"("status", lower("city"));
CREATE INDEX "MarketShop_status_city_lower_idx" ON "public"."MarketShop"("status", lower("city"));
CREATE INDEX "Community_status_city_lower_idx" ON "public"."Community"("status", lower("city"));
