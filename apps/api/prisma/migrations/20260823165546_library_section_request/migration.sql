-- Заявка на новый раздел справочника: разделы заводит администрация, но
-- участнику нужен способ попросить недостающий.

-- CreateEnum
CREATE TYPE "LibrarySectionRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "LibrarySectionRequest" (
    "id" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "titleRu" TEXT NOT NULL,
    "titleEn" TEXT NOT NULL,
    "reason" TEXT,
    "status" "LibrarySectionRequestStatus" NOT NULL DEFAULT 'pending',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decision" TEXT,
    "createdSectionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LibrarySectionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LibrarySectionRequest_status_createdAt_idx" ON "LibrarySectionRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "LibrarySectionRequest_requestedById_idx" ON "LibrarySectionRequest"("requestedById");

-- AddForeignKey
ALTER TABLE "LibrarySectionRequest" ADD CONSTRAINT "LibrarySectionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibrarySectionRequest" ADD CONSTRAINT "LibrarySectionRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
