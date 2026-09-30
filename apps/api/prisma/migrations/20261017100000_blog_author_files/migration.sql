-- Файлы личной страницы автора Блог-ленты (VED-686, часть 2).
CREATE TABLE "BlogAuthorFile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogAuthorFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogAuthorFile_storageKey_key" ON "BlogAuthorFile"("storageKey");
CREATE INDEX "BlogAuthorFile_userId_createdAt_idx" ON "BlogAuthorFile"("userId", "createdAt");

ALTER TABLE "BlogAuthorFile" ADD CONSTRAINT "BlogAuthorFile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
