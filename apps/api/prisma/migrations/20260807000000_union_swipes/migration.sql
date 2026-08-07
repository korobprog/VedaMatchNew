-- CreateEnum
CREATE TYPE "public"."UnionContactMode" AS ENUM ('requests', 'mutual_only');

-- CreateEnum
CREATE TYPE "public"."UnionSwipeDecision" AS ENUM ('like', 'superlike', 'pass');

-- AlterTable
ALTER TABLE "public"."UnionProfile" ADD COLUMN     "contactMode" "public"."UnionContactMode" NOT NULL DEFAULT 'requests';

-- CreateTable
CREATE TABLE "public"."UnionSwipe" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "decision" "public"."UnionSwipeDecision" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "UnionSwipe_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnionSwipe_toUserId_decision_idx" ON "public"."UnionSwipe"("toUserId", "decision");

-- CreateIndex
CREATE INDEX "UnionSwipe_fromUserId_undoneAt_createdAt_idx" ON "public"."UnionSwipe"("fromUserId", "undoneAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnionSwipe_fromUserId_toUserId_key" ON "public"."UnionSwipe"("fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "public"."UnionSwipe" ADD CONSTRAINT "UnionSwipe_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UnionSwipe" ADD CONSTRAINT "UnionSwipe_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
