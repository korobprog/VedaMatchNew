-- AlterTable
-- Отсутствие строки в NotificationPreference уже означает «всё включено»
-- (см. defaults в notifications.service.ts), поэтому DEFAULT true покрывает
-- и существующие строки, и отсутствующие: бэкфилл не нужен.
ALTER TABLE "public"."NotificationPreference" ADD COLUMN "market" BOOLEAN NOT NULL DEFAULT true;
