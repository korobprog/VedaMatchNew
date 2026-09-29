-- Библиотека (VED-662, часть 3б): файлы книг для скачивания.
CREATE TABLE "VedabaseBookFile" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" VARCHAR(8) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VedabaseBookFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VedabaseBookFile_storageKey_key" ON "VedabaseBookFile"("storageKey");
CREATE INDEX "VedabaseBookFile_bookId_createdAt_idx" ON "VedabaseBookFile"("bookId", "createdAt");

ALTER TABLE "VedabaseBookFile" ADD CONSTRAINT "VedabaseBookFile_bookId_fkey"
  FOREIGN KEY ("bookId") REFERENCES "VedabaseBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
