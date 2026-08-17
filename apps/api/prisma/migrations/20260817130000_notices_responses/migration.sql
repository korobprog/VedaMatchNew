-- CreateEnum
CREATE TYPE "public"."NoticeResponseStatus" AS ENUM ('open', 'accepted', 'declined', 'withdrawn');

-- CreateEnum
CREATE TYPE "public"."NoticeReportReason" AS ENUM ('spam', 'commercial', 'mlm', 'duplicate', 'scam', 'inappropriate_content', 'wrong_rubric', 'other');

-- CreateEnum
CREATE TYPE "public"."NoticeReportStatus" AS ENUM ('open', 'reviewed', 'dismissed');

-- CreateTable
CREATE TABLE "public"."NoticeResponse" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT,
    "status" "public"."NoticeResponseStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "NoticeResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NoticeThanks" (
    "id" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeThanks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NoticeReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "noticeId" TEXT NOT NULL,
    "reason" "public"."NoticeReportReason" NOT NULL,
    "note" TEXT,
    "status" "public"."NoticeReportStatus" NOT NULL DEFAULT 'open',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "moderatorNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoticeResponse_noticeId_status_createdAt_idx" ON "public"."NoticeResponse"("noticeId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "NoticeResponse_userId_createdAt_idx" ON "public"."NoticeResponse"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NoticeResponse_noticeId_userId_key" ON "public"."NoticeResponse"("noticeId", "userId");

-- CreateIndex
CREATE INDEX "NoticeThanks_toUserId_createdAt_idx" ON "public"."NoticeThanks"("toUserId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NoticeThanks_noticeId_fromUserId_key" ON "public"."NoticeThanks"("noticeId", "fromUserId");

-- CreateIndex
CREATE INDEX "NoticeReport_status_createdAt_idx" ON "public"."NoticeReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "NoticeReport_noticeId_idx" ON "public"."NoticeReport"("noticeId");

-- CreateIndex
CREATE UNIQUE INDEX "NoticeReport_reporterId_noticeId_key" ON "public"."NoticeReport"("reporterId", "noticeId");

-- AddForeignKey
ALTER TABLE "public"."NoticeResponse" ADD CONSTRAINT "NoticeResponse_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "public"."Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeResponse" ADD CONSTRAINT "NoticeResponse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeThanks" ADD CONSTRAINT "NoticeThanks_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "public"."Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeThanks" ADD CONSTRAINT "NoticeThanks_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeThanks" ADD CONSTRAINT "NoticeThanks_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeReport" ADD CONSTRAINT "NoticeReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeReport" ADD CONSTRAINT "NoticeReport_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "public"."Notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeReport" ADD CONSTRAINT "NoticeReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
