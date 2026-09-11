-- Второй шаг поиска по штрихкоду — открытая база Open Food Facts. Источник
-- хранится отдельным значением: строка из чужого каталога подписывается в
-- карточке, этого требует её лицензия (ODbL).
ALTER TYPE "WellnessProductSource" ADD VALUE 'openfoodfacts';
