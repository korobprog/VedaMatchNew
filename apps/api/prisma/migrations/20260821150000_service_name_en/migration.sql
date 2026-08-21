-- Английское название сервиса: до сих пор оно жило только в коде веба
-- (service-content.ts), из-за чего правка имени в админке не доезжала до
-- лендинга и шапки.
ALTER TABLE "Service" ADD COLUMN "nameEn" TEXT;

UPDATE "Service" SET "nameEn" = 'Union' WHERE slug = 'union';
UPDATE "Service" SET "nameEn" = 'Astrology' WHERE slug = 'astro';
UPDATE "Service" SET "nameEn" = 'Library' WHERE slug = 'vedabase';
UPDATE "Service" SET "nameEn" = 'Motivation' WHERE slug = 'motivation';
UPDATE "Service" SET "nameEn" = 'Contacts' WHERE slug = 'contacts';
UPDATE "Service" SET "nameEn" = 'Market' WHERE slug = 'market';
UPDATE "Service" SET "nameEn" = 'Education' WHERE slug = 'library';
UPDATE "Service" SET "nameEn" = 'Notices' WHERE slug = 'notices';
