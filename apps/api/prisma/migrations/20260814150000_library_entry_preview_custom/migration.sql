-- Обложку можно теперь загрузить вручную (замена авто-превью с сайта-источника).
-- Флаг нужен, чтобы фоновый бэкафилл (backfill-previews.ts) и повторное
-- скачивание OG-картинки не затирали то, что выбрал автор ссылки.

-- AlterTable
ALTER TABLE "public"."LibraryEntry" ADD COLUMN "previewIsCustom" BOOLEAN NOT NULL DEFAULT false;
