-- Библиотека (VED-662, часть 3): разметка книги для полки и блокировка.
ALTER TABLE "VedabaseBook"
  ADD COLUMN "audienceStages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "lineages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "blocked" BOOLEAN NOT NULL DEFAULT false;

-- Разметка, с которой полка жила до админки (была в коде веба):
-- книги Прабхупады — линия ISKCON, ступени — по книге.
UPDATE "VedabaseBook" SET "lineages" = ARRAY['iskcon']
  WHERE "author" ILIKE '%прабхупад%';

UPDATE "VedabaseBook" SET "audienceStages" = ARRAY['practitioner', 'devotee']
  WHERE "slug" IN ('srimad-bhagavatam', 'nectar-devotion', 'nectar-instructions', 'prayers-kunti');

UPDATE "VedabaseBook" SET "audienceStages" = ARRAY['devotee']
  WHERE "slug" = 'chaitanya-charitamrita';

UPDATE "VedabaseBook" SET "audienceStages" = ARRAY['seeker', 'practitioner', 'yogi']
  WHERE "slug" IN ('raja-vidya', 'perfection-yoga', 'path-perfection', 'beyond-birth-death',
                   'journey-krishna', 'another-chance', 'light-bhagavata');
