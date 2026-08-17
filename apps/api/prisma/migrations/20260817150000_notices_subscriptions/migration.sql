-- CreateEnum
CREATE TYPE "public"."NoticeSubscriptionKind" AS ENUM ('rubric', 'city', 'community');

-- AlterTable
ALTER TABLE "public"."NotificationPreference" ADD COLUMN     "notices" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."NoticeSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "public"."NoticeSubscriptionKind" NOT NULL,
    "targetKey" TEXT NOT NULL,
    "rubricId" TEXT,
    "city" TEXT,
    "communityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoticeSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoticeSubscription_kind_targetKey_idx" ON "public"."NoticeSubscription"("kind", "targetKey");

-- CreateIndex
CREATE INDEX "NoticeSubscription_userId_createdAt_idx" ON "public"."NoticeSubscription"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "NoticeSubscription_userId_targetKey_key" ON "public"."NoticeSubscription"("userId", "targetKey");

-- AddForeignKey
ALTER TABLE "public"."NoticeSubscription" ADD CONSTRAINT "NoticeSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeSubscription" ADD CONSTRAINT "NoticeSubscription_rubricId_fkey" FOREIGN KEY ("rubricId") REFERENCES "public"."NoticeRubric"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NoticeSubscription" ADD CONSTRAINT "NoticeSubscription_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "public"."Community"("id") ON DELETE CASCADE ON UPDATE CASCADE;
