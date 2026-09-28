-- Текст горячей кнопки «Пригласить», правит администратор (VED-618).
-- NULL — действует текст по умолчанию из кода.
ALTER TABLE "RewardsSettings" ADD COLUMN "inviteText" TEXT;
