-- Сервис «Музыка», этап 0: каркас каталога, плейлистов, загрузок и жалоб.
-- Взято из migrate diff вручную: сам diff рядом предлагает снести trgm-индексы
-- Библиотеки и мёртвые колонки заброшенных черновиков — см. память проекта.

-- CreateEnum
CREATE TYPE "public"."MusicArtistKind" AS ENUM ('kirtaneer', 'group', 'temple', 'unknown');

-- CreateEnum
CREATE TYPE "public"."MusicAlbumKind" AS ENUM ('album', 'live', 'compilation', 'single');

-- CreateEnum
CREATE TYPE "public"."MusicTrackStatus" AS ENUM ('draft', 'pending', 'published', 'rejected', 'hidden');

-- CreateEnum
CREATE TYPE "public"."MusicPlaylistVisibility" AS ENUM ('private', 'friends', 'public');

-- CreateEnum
CREATE TYPE "public"."MusicNowPlayingVisibility" AS ENUM ('friends', 'nobody');

-- CreateEnum
CREATE TYPE "public"."MusicUploadStatus" AS ENUM ('pending', 'completed', 'failed', 'expired');

-- CreateEnum
CREATE TYPE "public"."MusicUploadRightsBasis" AS ENUM ('own_recording', 'open_program', 'freely_distributed');

-- CreateEnum
CREATE TYPE "public"."MusicReportKind" AS ENUM ('copyright', 'content', 'quality');

-- CreateEnum
CREATE TYPE "public"."MusicReportStatus" AS ENUM ('open', 'resolved', 'rejected');
-- CreateTable
CREATE TABLE "public"."MusicArtist" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "public"."MusicArtistKind" NOT NULL DEFAULT 'unknown',
    "bio" TEXT,
    "coverKey" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicArtist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicAlbum" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistId" TEXT,
    "kind" "public"."MusicAlbumKind" NOT NULL DEFAULT 'album',
    "year" INTEGER,
    "coverKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicAlbum_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistId" TEXT,
    "albumId" TEXT,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "bitrateKbps" INTEGER,
    "coverKey" TEXT,
    "status" "public"."MusicTrackStatus" NOT NULL DEFAULT 'draft',
    "uploadedById" TEXT,
    "language" TEXT,
    "lyrics" TEXT,
    "transliteration" TEXT,
    "translation" TEXT,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicTrackCategory" (
    "trackId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "MusicTrackCategory_pkey" PRIMARY KEY ("trackId","categoryId")
);

-- CreateTable
CREATE TABLE "public"."MusicPlaylist" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverKey" TEXT,
    "visibility" "public"."MusicPlaylistVisibility" NOT NULL DEFAULT 'private',
    "trackCount" INTEGER NOT NULL DEFAULT 0,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicPlaylist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicPlaylistItem" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicPlaylistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicFavorite" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicFavorite_pkey" PRIMARY KEY ("userId","trackId")
);

-- CreateTable
CREATE TABLE "public"."MusicPlayState" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "positionSeconds" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicPlayState_pkey" PRIMARY KEY ("userId","trackId")
);

-- CreateTable
CREATE TABLE "public"."MusicNowPlaying" (
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "isPrivateSession" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "MusicNowPlaying_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."MusicListen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "listenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicListen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicUpload" (
    "id" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" "public"."MusicUploadStatus" NOT NULL DEFAULT 'pending',
    "sizeBytes" INTEGER NOT NULL,
    "mime" TEXT NOT NULL,
    "rightsBasis" "public"."MusicUploadRightsBasis" NOT NULL,
    "checksum" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicUpload_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicReport" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "reporterId" TEXT,
    "kind" "public"."MusicReportKind" NOT NULL,
    "text" TEXT NOT NULL,
    "status" "public"."MusicReportStatus" NOT NULL DEFAULT 'open',
    "decidedAt" TIMESTAMP(3),
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MusicSettings" (
    "userId" TEXT NOT NULL,
    "nowPlayingVisibility" "public"."MusicNowPlayingVisibility" NOT NULL DEFAULT 'friends',
    "autoplay" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MusicSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MusicArtist_slug_key" ON "public"."MusicArtist"("slug");

-- CreateIndex
CREATE INDEX "MusicArtist_kind_idx" ON "public"."MusicArtist"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "MusicAlbum_slug_key" ON "public"."MusicAlbum"("slug");

-- CreateIndex
CREATE INDEX "MusicAlbum_artistId_idx" ON "public"."MusicAlbum"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicCategory_slug_key" ON "public"."MusicCategory"("slug");

-- CreateIndex
CREATE INDEX "MusicCategory_position_idx" ON "public"."MusicCategory"("position");

-- CreateIndex
CREATE UNIQUE INDEX "MusicTrack_storageKey_key" ON "public"."MusicTrack"("storageKey");

-- CreateIndex
CREATE INDEX "MusicTrack_status_publishedAt_idx" ON "public"."MusicTrack"("status", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "MusicTrack_artistId_idx" ON "public"."MusicTrack"("artistId");

-- CreateIndex
CREATE INDEX "MusicTrack_albumId_idx" ON "public"."MusicTrack"("albumId");

-- CreateIndex
CREATE INDEX "MusicTrack_uploadedById_status_idx" ON "public"."MusicTrack"("uploadedById", "status");

-- CreateIndex
CREATE INDEX "MusicTrackCategory_categoryId_idx" ON "public"."MusicTrackCategory"("categoryId");

-- CreateIndex
CREATE INDEX "MusicPlaylist_ownerId_updatedAt_idx" ON "public"."MusicPlaylist"("ownerId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "MusicPlaylist_visibility_idx" ON "public"."MusicPlaylist"("visibility");

-- CreateIndex
CREATE INDEX "MusicPlaylistItem_playlistId_position_idx" ON "public"."MusicPlaylistItem"("playlistId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MusicPlaylistItem_playlistId_trackId_key" ON "public"."MusicPlaylistItem"("playlistId", "trackId");

-- CreateIndex
CREATE INDEX "MusicFavorite_userId_createdAt_idx" ON "public"."MusicFavorite"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MusicFavorite_trackId_idx" ON "public"."MusicFavorite"("trackId");

-- CreateIndex
CREATE INDEX "MusicPlayState_userId_updatedAt_idx" ON "public"."MusicPlayState"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "MusicNowPlaying_trackId_idx" ON "public"."MusicNowPlaying"("trackId");

-- CreateIndex
CREATE INDEX "MusicNowPlaying_updatedAt_idx" ON "public"."MusicNowPlaying"("updatedAt");

-- CreateIndex
CREATE INDEX "MusicListen_userId_listenedAt_idx" ON "public"."MusicListen"("userId", "listenedAt" DESC);

-- CreateIndex
CREATE INDEX "MusicListen_trackId_listenedAt_idx" ON "public"."MusicListen"("trackId", "listenedAt");

-- CreateIndex
CREATE INDEX "MusicListen_listenedAt_idx" ON "public"."MusicListen"("listenedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MusicUpload_storageKey_key" ON "public"."MusicUpload"("storageKey");

-- CreateIndex
CREATE INDEX "MusicUpload_uploaderId_status_idx" ON "public"."MusicUpload"("uploaderId", "status");

-- CreateIndex
CREATE INDEX "MusicUpload_status_createdAt_idx" ON "public"."MusicUpload"("status", "createdAt");

-- CreateIndex
CREATE INDEX "MusicUpload_checksum_idx" ON "public"."MusicUpload"("checksum");

-- CreateIndex
CREATE INDEX "MusicReport_status_kind_idx" ON "public"."MusicReport"("status", "kind");

-- CreateIndex
CREATE INDEX "MusicReport_trackId_idx" ON "public"."MusicReport"("trackId");

-- AddForeignKey
ALTER TABLE "public"."MusicAlbum" ADD CONSTRAINT "MusicAlbum_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."MusicArtist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicTrack" ADD CONSTRAINT "MusicTrack_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "public"."MusicArtist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicTrack" ADD CONSTRAINT "MusicTrack_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "public"."MusicAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicTrack" ADD CONSTRAINT "MusicTrack_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicTrackCategory" ADD CONSTRAINT "MusicTrackCategory_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicTrackCategory" ADD CONSTRAINT "MusicTrackCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."MusicCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicPlaylist" ADD CONSTRAINT "MusicPlaylist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicPlaylistItem" ADD CONSTRAINT "MusicPlaylistItem_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "public"."MusicPlaylist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicPlaylistItem" ADD CONSTRAINT "MusicPlaylistItem_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicFavorite" ADD CONSTRAINT "MusicFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicFavorite" ADD CONSTRAINT "MusicFavorite_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicPlayState" ADD CONSTRAINT "MusicPlayState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicPlayState" ADD CONSTRAINT "MusicPlayState_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicNowPlaying" ADD CONSTRAINT "MusicNowPlaying_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicNowPlaying" ADD CONSTRAINT "MusicNowPlaying_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicListen" ADD CONSTRAINT "MusicListen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicListen" ADD CONSTRAINT "MusicListen_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicUpload" ADD CONSTRAINT "MusicUpload_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicReport" ADD CONSTRAINT "MusicReport_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "public"."MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicReport" ADD CONSTRAINT "MusicReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicReport" ADD CONSTRAINT "MusicReport_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MusicSettings" ADD CONSTRAINT "MusicSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

