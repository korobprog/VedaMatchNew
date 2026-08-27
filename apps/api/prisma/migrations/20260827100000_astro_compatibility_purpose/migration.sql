-- Цель сверки карт: от неё зависит состав кут в итоге, а не астрономия.
CREATE TYPE "AstroCompatibilityPurpose" AS ENUM ('family', 'business', 'friendship', 'service');

-- DEFAULT 'family' закрывает и уже существующие строки: до появления целей
-- гуна-милан считался ровно по-сватовски, всеми восемью кутами.
ALTER TABLE "AstroCompatibilityRequest"
  ADD COLUMN "purpose" "AstroCompatibilityPurpose" NOT NULL DEFAULT 'family';
