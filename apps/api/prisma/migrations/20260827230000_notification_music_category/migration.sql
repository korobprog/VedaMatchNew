-- Уведомления о судьбе своих записей в «Музыке». Отдельный тумблер, как у
-- «Мотивации»: это ответы по собственной загрузке, а не новости сервиса.
ALTER TABLE "public"."NotificationPreference" ADD COLUMN "music" BOOLEAN NOT NULL DEFAULT true;
