-- CreateEnum
CREATE TYPE "public"."LibraryCommentStatus" AS ENUM ('published', 'removed_by_author', 'removed_by_admin');

-- AlterTable
ALTER TABLE "public"."LibraryEntry" ADD COLUMN "commentsCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."LibraryBookmark" (
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryBookmark_pkey" PRIMARY KEY ("userId","entryId")
);

-- CreateTable
CREATE TABLE "public"."LibraryComment" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "userId" TEXT,
    "body" TEXT NOT NULL,
    "status" "public"."LibraryCommentStatus" NOT NULL DEFAULT 'published',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibraryComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibraryBookmark_entryId_idx" ON "public"."LibraryBookmark"("entryId");

-- CreateIndex
CREATE INDEX "LibraryBookmark_userId_createdAt_idx" ON "public"."LibraryBookmark"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LibraryComment_entryId_createdAt_idx" ON "public"."LibraryComment"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryComment_userId_idx" ON "public"."LibraryComment"("userId");

-- AddForeignKey
ALTER TABLE "public"."LibraryBookmark" ADD CONSTRAINT "LibraryBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LibraryBookmark" ADD CONSTRAINT "LibraryBookmark_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."LibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LibraryComment" ADD CONSTRAINT "LibraryComment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "public"."LibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."LibraryComment" ADD CONSTRAINT "LibraryComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
