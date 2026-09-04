-- CreateEnum
CREATE TYPE "public"."MusicIngestBatchStatus" AS ENUM ('draft', 'running', 'ready', 'published', 'failed');

-- CreateEnum
CREATE TYPE "public"."MusicIngestSource" AS ENUM ('upload', 'url', 'zip');

-- CreateEnum
CREATE TYPE "public"."MusicIngestItemStatus" AS ENUM ('waiting', 'fetching', 'stored', 'skipped', 'failed');

-- CreateTable
CREATE TABLE "public"."MusicIngestBatch" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" TEXT,
    "status" "public"."MusicIngestBatchStatus" NOT NULL DEFAULT 'draft',
    "rightsBasis" "public"."MusicUploadRightsBasis" NOT NULL,
    "rightsNote" TEXT,
    "artistId" TEXT,
    "albumId" TEXT,
    "categoryIds" TEXT[],
    "language" TEXT,
    "isLiveRecording" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicIngestBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicIngestItem" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "source" "public"."MusicIngestSource" NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "public"."MusicIngestItemStatus" NOT NULL DEFAULT 'waiting',
    "storageKey" TEXT,
    "checksum" TEXT,
    "trackId" TEXT,
    "duplicateOfTrackId" TEXT,
    "failureReason" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicIngestItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MusicIngestBatch_status_updatedAt_idx" ON "public"."MusicIngestBatch"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MusicIngestItem_trackId_key" ON "public"."MusicIngestItem"("trackId");

-- CreateIndex
CREATE INDEX "MusicIngestItem_status_updatedAt_idx" ON "public"."MusicIngestItem"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "MusicIngestItem_batchId_position_idx" ON "public"."MusicIngestItem"("batchId", "position");

-- CreateIndex
CREATE INDEX "MusicIngestItem_checksum_idx" ON "public"."MusicIngestItem"("checksum");

-- AddForeignKey
ALTER TABLE "public"."MusicIngestBatch" ADD CONSTRAINT "MusicIngestBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicIngestBatch" ADD CONSTRAINT "MusicIngestBatch_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."MusicArtist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicIngestBatch" ADD CONSTRAINT "MusicIngestBatch_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "public"."MusicAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicIngestItem" ADD CONSTRAINT "MusicIngestItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."MusicIngestBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicIngestItem" ADD CONSTRAINT "MusicIngestItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."MusicTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicIngestItem" ADD CONSTRAINT "MusicIngestItem_duplicateOfTrackId_fkey" FOREIGN KEY ("duplicateOfTrackId") REFERENCES "public"."MusicTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

