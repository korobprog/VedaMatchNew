-- CreateTable
CREATE TABLE "public"."MotivationCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivationCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MotivationCategory_slug_key" ON "public"."MotivationCategory"("slug");

-- CreateIndex
CREATE INDEX "MotivationCategory_sortOrder_idx" ON "public"."MotivationCategory"("sortOrder");

-- CreateIndex
CREATE INDEX "MotivationCategory_parentId_idx" ON "public"."MotivationCategory"("parentId");

-- AddForeignKey
ALTER TABLE "public"."MotivationCategory" ADD CONSTRAINT "MotivationCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."MotivationCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Дефолтная категория под уже существующие посты со слагом 'verified_quote'.
INSERT INTO "public"."MotivationCategory" ("id", "slug", "title", "sortOrder", "isDefault", "createdAt", "updatedAt")
VALUES (gen_random_uuid(), 'verified_quote', 'Проверенная цитата', 0, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Справочник дополняется слагами, которые уже встречаются у постов.
INSERT INTO "public"."MotivationCategory" ("id", "slug", "title", "sortOrder", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid(), p."category", p."category", 100, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "category" FROM "public"."MotivationPost") AS p
WHERE p."category" <> 'verified_quote';
