-- «Избранные» смайлики по умолчанию (VED-123): набор задаёт администрация
-- в админке чата. Пустой массив — встроенный набор CHAT_DEFAULT_FAVORITE_EMOJIS.
ALTER TABLE "ChatSettings" ADD COLUMN "favoriteEmojis" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
