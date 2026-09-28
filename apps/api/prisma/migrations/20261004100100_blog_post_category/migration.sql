-- Категория поста Блог-ленты (VED-590): Знания, Новости, Жизнь преданных,
-- Календарь. NULL — без категории: такой пост виден только во «Все».
CREATE TYPE "BlogPostCategory" AS ENUM ('knowledge', 'news', 'devotee_life', 'calendar');

ALTER TABLE "BlogPost" ADD COLUMN "category" "BlogPostCategory";
