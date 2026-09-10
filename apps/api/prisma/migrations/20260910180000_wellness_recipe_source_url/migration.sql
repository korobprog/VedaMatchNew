-- Ссылка на оригинал у импортированного рецепта. Атрибуция без проверяемого
-- адреса — это слова, а не атрибуция.
ALTER TABLE "WellnessRecipe" ADD COLUMN "sourceUrl" TEXT;
