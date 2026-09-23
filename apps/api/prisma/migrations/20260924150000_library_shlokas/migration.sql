-- VED-386: раздел «Шлоки» в Образовании. Только добавления: новое значение
-- энума и три новые таблицы. Существующие строки не трогаются.
--
-- Новое значение энума в этой же миграции нигде не используется — Postgres
-- не даёт пользоваться им до конца транзакции, в которой оно добавлено.

-- AlterEnum
ALTER TYPE "LibraryEntryType" ADD VALUE 'shloka';

-- CreateTable
CREATE TABLE "LibraryShloka" (
    "entryId" TEXT NOT NULL,
    "verse" VARCHAR(40),
    "text" TEXT NOT NULL,
    "wordByWord" TEXT,
    "translation" TEXT,
    "commentary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryShloka_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "LibraryShlokaAcharya" (
    "id" TEXT NOT NULL,
    "shlokaId" TEXT NOT NULL,
    "acharya" VARCHAR(120) NOT NULL,
    "text" TEXT,
    "wordByWord" TEXT,
    "translation" TEXT,
    "commentary" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryShlokaAcharya_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryShlokaImage" (
    "id" TEXT NOT NULL,
    "shlokaId" TEXT NOT NULL,
    "acharyaId" TEXT,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryShlokaImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryShlokaAcharya_shlokaId_position_idx" ON "LibraryShlokaAcharya"("shlokaId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "LibraryShlokaImage_storageKey_key" ON "LibraryShlokaImage"("storageKey");

-- CreateIndex
CREATE INDEX "LibraryShlokaImage_shlokaId_position_idx" ON "LibraryShlokaImage"("shlokaId", "position");

-- CreateIndex
CREATE INDEX "LibraryShlokaImage_acharyaId_idx" ON "LibraryShlokaImage"("acharyaId");

-- AddForeignKey
ALTER TABLE "LibraryShloka" ADD CONSTRAINT "LibraryShloka_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryShlokaAcharya" ADD CONSTRAINT "LibraryShlokaAcharya_shlokaId_fkey" FOREIGN KEY ("shlokaId") REFERENCES "LibraryShloka"("entryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryShlokaImage" ADD CONSTRAINT "LibraryShlokaImage_shlokaId_fkey" FOREIGN KEY ("shlokaId") REFERENCES "LibraryShloka"("entryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryShlokaImage" ADD CONSTRAINT "LibraryShlokaImage_acharyaId_fkey" FOREIGN KEY ("acharyaId") REFERENCES "LibraryShlokaAcharya"("id") ON DELETE CASCADE ON UPDATE CASCADE;
