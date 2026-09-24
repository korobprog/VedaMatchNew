-- VED-129: статусы в Общении — посты на сутки с кружком вокруг аватарки.
-- CreateEnum
CREATE TYPE "public"."ChatStatusMediaKind" AS ENUM ('photo', 'video');

-- CreateTable
CREATE TABLE "public"."ChatStatus" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "text" TEXT,
    "mediaKind" "public"."ChatStatusMediaKind",
    "mediaUrl" TEXT,
    "mediaKey" TEXT,
    "posterUrl" TEXT,
    "posterKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatStatusView" (
    "statusId" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatStatusView_pkey" PRIMARY KEY ("statusId","viewerId")
);

-- CreateIndex
CREATE INDEX "ChatStatus_authorId_expiresAt_idx" ON "public"."ChatStatus"("authorId", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatStatus_expiresAt_idx" ON "public"."ChatStatus"("expiresAt");

-- CreateIndex
CREATE INDEX "ChatStatusView_viewerId_idx" ON "public"."ChatStatusView"("viewerId");

-- AddForeignKey
ALTER TABLE "public"."ChatStatus" ADD CONSTRAINT "ChatStatus_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatStatusView" ADD CONSTRAINT "ChatStatusView_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "public"."ChatStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatStatusView" ADD CONSTRAINT "ChatStatusView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

