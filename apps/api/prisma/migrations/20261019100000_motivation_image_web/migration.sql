-- Копия иллюстрации Вдохновения для ленты: WebP в полном размере оригинала.
ALTER TABLE "MotivationPost" ADD COLUMN "imageWebUrl" TEXT,
ADD COLUMN "imageWebAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "imageWebAttemptAt" TIMESTAMP(3);
