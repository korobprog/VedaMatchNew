-- VED-139: у открыток и афоризмов с иллюстрацией — свои меню категорий.
CREATE TYPE "MotivationCategoryFeed" AS ENUM ('both', 'art', 'cards');

ALTER TABLE "MotivationCategory"
  ADD COLUMN "feed" "MotivationCategoryFeed" NOT NULL DEFAULT 'both';
