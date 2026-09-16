-- Отметка «устройство умеет нативные звонки» (VED-220): такому устройству
-- входящий звонок шлётся data-only пушем, а не обычным уведомлением.
ALTER TABLE "NotificationDevice" ADD COLUMN "nativeCalls" BOOLEAN NOT NULL DEFAULT false;
