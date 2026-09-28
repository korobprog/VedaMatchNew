-- Заголовок страницы рубрики Образования отдельно от её названия (VED-394):
-- правка в окне рубрики меняет только его, а плитка, путь и чипы на карточках
-- остаются с прежним названием. NULL — заголовок равен названию.
ALTER TABLE "LibraryCategory" ADD COLUMN "pageTitleRu" TEXT;
ALTER TABLE "LibraryCategory" ADD COLUMN "pageTitleEn" TEXT;
