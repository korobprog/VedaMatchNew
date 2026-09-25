-- «В Блог-ленту» из Образования (VED-490): пост со ссылкой на материал и
-- отметка у материала, когда его отправили.
ALTER TABLE "BlogPost" ADD COLUMN "linkUrl" TEXT,
ADD COLUMN "linkLabel" TEXT,
ADD COLUMN "linkImageUrl" TEXT;

ALTER TABLE "LibraryEntry" ADD COLUMN "blogSharedAt" TIMESTAMP(3);
