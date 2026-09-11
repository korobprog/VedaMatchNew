-- Файлы книг у материала Образования: pdf, epub, djvu, doc и прочие.
-- Сами файлы лежат в S3, здесь — ключ объекта и то, что нужно списку.
-- Строка появляется только после того, как объект сверен в бакете, поэтому
-- незавершённых заливок в таблице не бывает.
CREATE TABLE "LibraryEntryFile" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" VARCHAR(8) NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryEntryFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LibraryEntryFile_storageKey_key" ON "LibraryEntryFile"("storageKey");

CREATE INDEX "LibraryEntryFile_entryId_createdAt_idx" ON "LibraryEntryFile"("entryId", "createdAt");

-- Удалили материал — ушли и строки файлов. Объекты в бакете сервис убирает
-- сам, забрав ключи до удаления.
ALTER TABLE "LibraryEntryFile" ADD CONSTRAINT "LibraryEntryFile_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LibraryEntryFile" ADD CONSTRAINT "LibraryEntryFile_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
