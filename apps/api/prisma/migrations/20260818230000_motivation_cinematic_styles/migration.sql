-- Кинематографические визуальные стили.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md.

ALTER TYPE "public"."MotivationVisualStyle" ADD VALUE IF NOT EXISTS 'cinematic_film';
ALTER TYPE "public"."MotivationVisualStyle" ADD VALUE IF NOT EXISTS 'epic_wide';
ALTER TYPE "public"."MotivationVisualStyle" ADD VALUE IF NOT EXISTS 'night_devotional';
ALTER TYPE "public"."MotivationVisualStyle" ADD VALUE IF NOT EXISTS 'painterly_realism';
