-- Семейства refresh-токенов (VED-233). Повтор отозванного токена отзывает
-- только своё семейство, а не все сессии человека; повтор в первую минуту
-- после ротации — гонка, без отзыва. Обе колонки nullable: старые строки
-- остаются как есть, семейство им проставляет следующая ротация.
ALTER TABLE "public"."RefreshToken" ADD COLUMN "revokedAt" TIMESTAMP(3);
ALTER TABLE "public"."RefreshToken" ADD COLUMN "familyId" TEXT;

CREATE INDEX "RefreshToken_familyId_idx" ON "public"."RefreshToken"("familyId");
