-- VED-401: две кнопки «Вдохновения» на главной, настраиваемые участником.
-- Только добавление nullable-колонок: существующие строки получают NULL,
-- что и означает «по умолчанию».
ALTER TABLE "MotivationPreference" ADD COLUMN "homeSourceWork" VARCHAR(200);
ALTER TABLE "MotivationPreference" ADD COLUMN "homeCategorySlug" VARCHAR(120);
