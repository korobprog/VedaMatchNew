-- Библиотека музыкальных подложек.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md.

CREATE TYPE "public"."MotivationTrackStatus" AS ENUM ('draft', 'approved', 'rejected');

CREATE TABLE "public"."MotivationTrack" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "status" "public"."MotivationTrackStatus" NOT NULL DEFAULT 'draft',
    "model" TEXT NOT NULL,
    "costUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MotivationTrack_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MotivationTrack_status_createdAt_idx" ON "public"."MotivationTrack"("status", "createdAt");

ALTER TABLE "public"."MotivationTrack" ADD CONSTRAINT "MotivationTrack_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."MotivationSettings"
  ADD COLUMN "musicModel" TEXT,
  ADD COLUMN "defaultTrackId" TEXT;
