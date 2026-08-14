-- CreateEnum
CREATE TYPE "public"."ReleaseChangeType" AS ENUM ('feature', 'fix', 'improvement');

-- CreateEnum
CREATE TYPE "public"."RoadmapStatus" AS ENUM ('planned', 'in_progress', 'done');

-- CreateEnum
CREATE TYPE "public"."AnnouncementStatus" AS ENUM ('draft', 'published');

-- ВНИМАНИЕ: `prisma migrate diff` дополнительно предлагает здесь удаление
-- GIN-индексов LibraryEntry_searchVector_idx и LibraryCategory_*_trgm_idx, а также
-- сброс DEFAULT у generated-колонки "searchVector". Эти объекты создаёт сырой SQL
-- в миграции library_core, в schema.prisma они не описаны, поэтому diff-движок
-- считает их лишними. Удалять нельзя — сломается поиск и подсказка дублей.
-- Подробности: docs/prisma-raw-sql-objects.md — этот блок сюда намеренно не включён.

-- CreateTable
CREATE TABLE "public"."Release" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Release_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ReleaseChange" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "type" "public"."ReleaseChangeType" NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ReleaseChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Announcement" (
    "id" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "bodyRu" TEXT NOT NULL,
    "bodyEn" TEXT NOT NULL,
    "status" "public"."AnnouncementStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RoadmapItem" (
    "id" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "descriptionRu" TEXT,
    "descriptionEn" TEXT,
    "status" "public"."RoadmapStatus" NOT NULL DEFAULT 'planned',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoadmapItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Release_version_key" ON "public"."Release"("version");

-- CreateIndex
CREATE INDEX "Release_isCurrent_idx" ON "public"."Release"("isCurrent");

-- CreateIndex
CREATE INDEX "Release_releasedAt_idx" ON "public"."Release"("releasedAt" DESC);

-- CreateIndex
CREATE INDEX "ReleaseChange_releaseId_sortOrder_idx" ON "public"."ReleaseChange"("releaseId", "sortOrder");

-- CreateIndex
CREATE INDEX "Announcement_status_publishedAt_idx" ON "public"."Announcement"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "RoadmapItem_status_sortOrder_idx" ON "public"."RoadmapItem"("status", "sortOrder");

-- AddForeignKey
ALTER TABLE "public"."ReleaseChange" ADD CONSTRAINT "ReleaseChange_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "public"."Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;
