-- VED-446: новые посты Блог-ленты по умолчанию без срока.
ALTER TABLE "BlogSettings" ALTER COLUMN "feedLifetimeHours" SET DEFAULT 0;

-- Сохранённая настройка тоже переключается: заказчик просил «без срока для
-- всех новых постов». Уже опубликованные посты не трогаем — их срок записан
-- в самом посте (feedUntil).
UPDATE "BlogSettings" SET "feedLifetimeHours" = 0;
