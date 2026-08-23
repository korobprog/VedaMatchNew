-- Материал без ссылки: адрес перестаёт быть обязательным, появляется
-- источник («Бхагавад-гита 9.22, комментарий Прабхупады»).

-- AlterEnum: обогащать нечего, когда ссылки нет.
ALTER TYPE "LibraryEnrichmentStatus" ADD VALUE 'not_applicable';

-- AlterTable
ALTER TABLE "LibraryEntry" ADD COLUMN     "source" TEXT,
ALTER COLUMN "url" DROP NOT NULL,
ALTER COLUMN "urlNormalized" DROP NOT NULL,
ALTER COLUMN "domain" DROP NOT NULL;

-- Инвариант, который Prisma не выражает: заполнено хотя бы одно из двух.
-- Сервис проверяет то же самое, но база — последняя линия обороны.
ALTER TABLE "LibraryEntry" ADD CONSTRAINT "LibraryEntry_url_or_source"
  CHECK ("url" IS NOT NULL OR "source" IS NOT NULL);
