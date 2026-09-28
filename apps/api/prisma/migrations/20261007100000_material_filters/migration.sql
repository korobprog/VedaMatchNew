-- VED-617: «Фильтры материалов» на главной — ступени и линии, которые человек
-- видит в Образовании и Медиатеке. Пустые массивы — «все». Пока
-- `materialFiltersSetAt` пуст, фильтры выводятся из анкеты и прежнего
-- переключателя `showAllStages` (VED-575), поэтому бэкфил не нужен: у всех
-- старых аккаунтов выдача по ступеням остаётся той же.
ALTER TABLE "User" ADD COLUMN "materialStages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "materialLineages" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "User" ADD COLUMN "materialFiltersSetAt" TIMESTAMP(3);
