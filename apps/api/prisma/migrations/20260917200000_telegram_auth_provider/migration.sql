-- Вход через Telegram: мини-приложение @vedamatch_bot на ios.vedamatch.com.
-- Отдельной миграцией: новое значение enum нельзя использовать в той же
-- транзакции, где оно добавлено, а строка настроек ниже его использует.
ALTER TYPE "AuthProvider" ADD VALUE IF NOT EXISTS 'telegram';
