-- Уменьшенная копия снимка галереи: ключ объекта рядом с оригиналом.
ALTER TABLE "UserPhoto" ADD COLUMN "thumbKey" TEXT;

CREATE UNIQUE INDEX "UserPhoto_thumbKey_key" ON "UserPhoto"("thumbKey");
