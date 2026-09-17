-- Веха 4, «Уведомления через Telegram-бота»: общий выключатель доставки
-- через @vedamatch_bot поверх категорий колокольчика.
ALTER TABLE "NotificationPreference" ADD COLUMN "telegram" BOOLEAN NOT NULL DEFAULT true;
