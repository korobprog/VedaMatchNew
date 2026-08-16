-- AlterTable
-- Духовное имя необязательно: у существующих аккаунтов его нет, и NULL здесь
-- означает «показывать обычное имя» (resolveDisplayName в @vedamatch/shared),
-- поэтому бэкфилл не нужен.
ALTER TABLE "public"."User" ADD COLUMN "spiritualName" TEXT;
