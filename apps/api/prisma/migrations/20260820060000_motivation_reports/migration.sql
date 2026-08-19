-- Жалобы на рилсы участников и порог автоскрытия.
--
-- Написано вручную, см. docs/prisma-raw-sql-objects.md: `migrate dev` дописал
-- бы сюда удаление триграм-индексов и generated-колонки searchVector.

-- CreateTable
CREATE TABLE "public"."MotivationReport" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MotivationReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MotivationReport_postId_reporterId_key" ON "public"."MotivationReport"("postId", "reporterId");

-- CreateIndex
CREATE INDEX "MotivationReport_postId_createdAt_idx" ON "public"."MotivationReport"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."MotivationReport" ADD CONSTRAINT "MotivationReport_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."MotivationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MotivationReport" ADD CONSTRAINT "MotivationReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "public"."MotivationSettings" ADD COLUMN "reportsToHide" INTEGER NOT NULL DEFAULT 3;
