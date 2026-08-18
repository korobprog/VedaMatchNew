-- Настройки сервиса «Мотивация»: одна строка, всё кроме секретов.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md.

CREATE TABLE "public"."MotivationSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "videoModel" TEXT,
    "videoSeconds" INTEGER,
    "videoAudio" BOOLEAN,
    "voiceModel" TEXT,
    "voiceName" TEXT,
    "imageModel" TEXT,
    "visualStyle" "public"."MotivationVisualStyle",
    "dailyBudgetUsd" DECIMAL(10,2),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivationSettings_pkey" PRIMARY KEY ("id")
);
