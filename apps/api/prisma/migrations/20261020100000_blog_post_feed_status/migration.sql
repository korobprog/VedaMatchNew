-- Пост с личной страницы в общую ленту — через администратора (VED-686).
CREATE TYPE "BlogPostFeedStatus" AS ENUM ('feed', 'personal', 'pending', 'rejected');

ALTER TABLE "BlogPost" ADD COLUMN "feedStatus" "BlogPostFeedStatus" NOT NULL DEFAULT 'feed',
ADD COLUMN "feedRequestedAt" TIMESTAMP(3),
ADD COLUMN "feedReviewedAt" TIMESTAMP(3),
ADD COLUMN "feedReviewedById" TEXT,
ADD COLUMN "feedReviewNote" TEXT;

CREATE INDEX "BlogPost_feedStatus_feedRequestedAt_idx" ON "BlogPost"("feedStatus", "feedRequestedAt");
