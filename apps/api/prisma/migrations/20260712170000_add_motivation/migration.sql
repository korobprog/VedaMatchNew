CREATE TYPE "MotivationProfileType" AS ENUM ('user', 'in_goodness', 'yogi', 'devotee');
CREATE TYPE "MotivationAudienceTrack" AS ENUM ('universal', 'vaishnava');
CREATE TYPE "MotivationPostStatus" AS ENUM ('draft', 'generating', 'published', 'failed', 'hidden');
CREATE TYPE "MotivationAttributionKind" AS ENUM ('exact_quote', 'faithful_paraphrase', 'ai_reflection');

CREATE TABLE "MotivationPost" (
  "id" TEXT NOT NULL, "contentDate" DATE NOT NULL, "profileType" "MotivationProfileType" NOT NULL,
  "audienceTrack" "MotivationAudienceTrack" NOT NULL, "slug" TEXT NOT NULL, "category" TEXT NOT NULL,
  "status" "MotivationPostStatus" NOT NULL DEFAULT 'draft', "imageUrl" TEXT, "storyImageUrl" TEXT,
  "attributionKind" "MotivationAttributionKind" NOT NULL DEFAULT 'ai_reflection', "attributionSpeaker" TEXT,
  "attributionWork" TEXT, "attributionLocator" TEXT, "attributionSourceUrl" TEXT, "sourceVerified" BOOLEAN NOT NULL DEFAULT false,
  "generationStage" TEXT, "generationErrorCode" TEXT, "promptVersion" TEXT, "modelVersion" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0, "estimatedCostUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MotivationPost_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MotivationPost_slug_key" ON "MotivationPost"("slug");
CREATE UNIQUE INDEX "MotivationPost_contentDate_profileType_audienceTrack_key" ON "MotivationPost"("contentDate", "profileType", "audienceTrack");
CREATE INDEX "MotivationPost_profileType_audienceTrack_status_publishedAt_idx" ON "MotivationPost"("profileType", "audienceTrack", "status", "publishedAt");
CREATE INDEX "MotivationPost_category_status_publishedAt_idx" ON "MotivationPost"("category", "status", "publishedAt");

CREATE TABLE "MotivationPostTranslation" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "language" VARCHAR(8) NOT NULL, "title" TEXT NOT NULL,
  "text" TEXT NOT NULL, "storyText" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "MotivationPostTranslation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "MotivationPostTranslation_postId_language_key" ON "MotivationPostTranslation"("postId", "language");
CREATE INDEX "MotivationPostTranslation_language_idx" ON "MotivationPostTranslation"("language");

CREATE TABLE "MotivationPreference" (
  "userId" TEXT NOT NULL, "vaishnavaPercent" INTEGER NOT NULL DEFAULT 50, "language" VARCHAR(8) NOT NULL DEFAULT 'ru',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MotivationPreference_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "MotivationPreference_percent_check" CHECK ("vaishnavaPercent" BETWEEN 0 AND 100),
  CONSTRAINT "MotivationPreference_language_check" CHECK ("language" IN ('ru','en','hi'))
);
CREATE TABLE "MotivationFavorite" (
  "userId" TEXT NOT NULL, "postId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MotivationFavorite_pkey" PRIMARY KEY ("userId", "postId")
);
CREATE INDEX "MotivationFavorite_userId_createdAt_idx" ON "MotivationFavorite"("userId", "createdAt");
CREATE TABLE "MotivationView" (
  "userId" TEXT NOT NULL, "postId" TEXT NOT NULL, "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MotivationView_pkey" PRIMARY KEY ("userId", "postId")
);
CREATE INDEX "MotivationView_userId_viewedAt_idx" ON "MotivationView"("userId", "viewedAt");

ALTER TABLE "MotivationPostTranslation" ADD CONSTRAINT "MotivationPostTranslation_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MotivationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotivationPreference" ADD CONSTRAINT "MotivationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotivationFavorite" ADD CONSTRAINT "MotivationFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotivationFavorite" ADD CONSTRAINT "MotivationFavorite_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MotivationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotivationView" ADD CONSTRAINT "MotivationView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotivationView" ADD CONSTRAINT "MotivationView_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MotivationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
