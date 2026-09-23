-- Блог-лента: избранное участника (VED-238) и ролики в постах (VED-116).
-- Только добавления: новый тип, новые колонки с умолчанием и новая таблица.
-- Существующие картинки получают kind = 'photo' умолчанием колонки.

-- CreateEnum
CREATE TYPE "BlogMediaKind" AS ENUM ('photo', 'video');

-- AlterTable
ALTER TABLE "BlogPostImage" ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "kind" "BlogMediaKind" NOT NULL DEFAULT 'photo',
ADD COLUMN     "posterKey" TEXT,
ADD COLUMN     "posterUrl" TEXT;

-- CreateTable
CREATE TABLE "BlogFavorite" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BlogFavorite_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateIndex
CREATE INDEX "BlogFavorite_postId_idx" ON "BlogFavorite"("postId");

-- AddForeignKey
ALTER TABLE "BlogFavorite" ADD CONSTRAINT "BlogFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlogFavorite" ADD CONSTRAINT "BlogFavorite_postId_fkey" FOREIGN KEY ("postId") REFERENCES "BlogPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
