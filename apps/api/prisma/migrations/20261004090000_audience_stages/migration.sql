-- VED-575: фильтр по самоидентификации у материалов Образования и записей
-- Медиатеки. Пустой массив — «для всех», поэтому старые строки ничего не
-- теряют и бэкфил не нужен.
ALTER TABLE "LibraryEntry" ADD COLUMN "audienceStages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "MusicTrack" ADD COLUMN "audienceStages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Портальный переключатель «Моя ступень / Все ступени» на главной.
ALTER TABLE "User" ADD COLUMN "showAllStages" BOOLEAN NOT NULL DEFAULT false;
