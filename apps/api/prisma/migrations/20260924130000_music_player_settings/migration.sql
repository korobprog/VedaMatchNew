-- VED-388: настройки плеера и метки-закладки.
-- Только добавляет: новые колонки с умолчаниями (существующие строки
-- получают прежнее поведение — шаг 15 с, ничего не вынесено) и новую таблицу.

-- AlterTable
ALTER TABLE "MusicSettings"
  ADD COLUMN "seekBackSeconds" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "seekForwardSeconds" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "playerShowSeek" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "playerShowBookmark" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "playerShowHistory" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MusicBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "positionSeconds" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MusicBookmark_userId_trackId_positionSeconds_idx" ON "MusicBookmark"("userId", "trackId", "positionSeconds");

-- CreateIndex
CREATE INDEX "MusicBookmark_trackId_idx" ON "MusicBookmark"("trackId");

-- AddForeignKey
ALTER TABLE "MusicBookmark" ADD CONSTRAINT "MusicBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicBookmark" ADD CONSTRAINT "MusicBookmark_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
