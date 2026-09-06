-- CreateEnum
CREATE TYPE "public"."ChatMomentKind" AS ENUM ('photo', 'text');

-- CreateEnum
CREATE TYPE "public"."ChatMomentAudience" AS ENUM ('contacts', 'everyone');

-- AlterEnum
ALTER TYPE "public"."ChatAttachmentKind" ADD VALUE 'moment';

-- AlterTable
ALTER TABLE "public"."ChatConversation" ADD COLUMN     "savedForId" TEXT;

-- AlterTable
ALTER TABLE "public"."ChatReport" ADD COLUMN     "momentId" TEXT;

-- CreateTable
CREATE TABLE "public"."ChatMoment" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "public"."ChatMomentKind" NOT NULL,
    "audience" "public"."ChatMomentAudience" NOT NULL DEFAULT 'contacts',
    "url" TEXT,
    "key" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "background" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMoment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMomentView" (
    "id" TEXT NOT NULL,
    "momentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMomentView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMomentSettings" (
    "userId" TEXT NOT NULL,
    "showToEveryone" BOOLEAN,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMomentSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "ChatMoment_authorId_expiresAt_idx" ON "public"."ChatMoment"("authorId", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatMoment_audience_expiresAt_idx" ON "public"."ChatMoment"("audience", "expiresAt");

-- CreateIndex
CREATE INDEX "ChatMoment_expiresAt_idx" ON "public"."ChatMoment"("expiresAt");

-- CreateIndex
CREATE INDEX "ChatMomentView_momentId_idx" ON "public"."ChatMomentView"("momentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMomentView_momentId_userId_key" ON "public"."ChatMomentView"("momentId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatConversation_savedForId_key" ON "public"."ChatConversation"("savedForId");

-- AddForeignKey
ALTER TABLE "public"."ChatConversation" ADD CONSTRAINT "ChatConversation_savedForId_fkey" FOREIGN KEY ("savedForId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatReport" ADD CONSTRAINT "ChatReport_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "public"."ChatMoment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMoment" ADD CONSTRAINT "ChatMoment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMomentView" ADD CONSTRAINT "ChatMomentView_momentId_fkey" FOREIGN KEY ("momentId") REFERENCES "public"."ChatMoment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMomentView" ADD CONSTRAINT "ChatMomentView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMomentSettings" ADD CONSTRAINT "ChatMomentSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
