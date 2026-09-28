-- VED-629: лёгкая WebP-копия иллюстрации для ленты и викторины и учёт
-- попыток её бэкфилла.
ALTER TABLE "MotivationPost" ADD COLUMN "imageThumbUrl" TEXT,
ADD COLUMN "imageThumbAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "imageThumbAttemptAt" TIMESTAMP(3);
