-- Фотоальбом личной страницы автора Блог-ленты (VED-686, часть 3).
CREATE TABLE "BlogAlbumPhoto" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogAlbumPhoto_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BlogAlbumPhoto_storageKey_key" ON "BlogAlbumPhoto"("storageKey");
CREATE INDEX "BlogAlbumPhoto_userId_createdAt_idx" ON "BlogAlbumPhoto"("userId", "createdAt");

ALTER TABLE "BlogAlbumPhoto" ADD CONSTRAINT "BlogAlbumPhoto_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
