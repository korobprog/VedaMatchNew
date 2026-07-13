CREATE TYPE "MotivationReviewStatus" AS ENUM ('discovered', 'source_verified', 'text_review', 'image_queued', 'image_review', 'published', 'rejected', 'failed');
CREATE TYPE "MotivationQuoteSourceType" AS ENUM ('vedamatch_library', 'approved_web');
CREATE TYPE "MotivationTranslationKind" AS ENUM ('official', 'vedamatch');
CREATE TYPE "MotivationVisualStyle" AS ENUM ('spiritual_watercolor', 'cinematic_nature', 'indian_miniature', 'sacred_architecture', 'minimal_symbolism', 'warm_documentary', 'cosmic_contemplation', 'historical_editorial');

CREATE TABLE "MotivationQuote" (
  "id" TEXT NOT NULL,
  "originalText" TEXT NOT NULL,
  "normalizedHash" TEXT NOT NULL,
  "originalLanguage" VARCHAR(8) NOT NULL,
  "author" TEXT NOT NULL,
  "work" TEXT NOT NULL,
  "locator" TEXT NOT NULL,
  "sourceType" "MotivationQuoteSourceType" NOT NULL,
  "sourceUrl" TEXT,
  "vedabaseBookSlug" TEXT,
  "vedabaseChapterSlug" TEXT,
  "contextExcerpt" TEXT NOT NULL,
  "verified" BOOLEAN NOT NULL DEFAULT false,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MotivationQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MotivationQuoteTranslation" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "language" VARCHAR(8) NOT NULL,
  "quoteText" TEXT NOT NULL,
  "translationKind" "MotivationTranslationKind" NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MotivationQuoteTranslation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MotivationQuoteProfile" (
  "quoteId" TEXT NOT NULL,
  "profileType" "MotivationProfileType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MotivationQuoteProfile_pkey" PRIMARY KEY ("quoteId", "profileType")
);

CREATE TABLE "MotivationModerationAudit" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MotivationModerationAudit_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MotivationPost" ADD COLUMN "quoteId" TEXT;
ALTER TABLE "MotivationPost" ADD COLUMN "reviewStatus" "MotivationReviewStatus";
ALTER TABLE "MotivationPost" ADD COLUMN "visualStyle" "MotivationVisualStyle";
ALTER TABLE "MotivationPost" ADD COLUMN "imagePrompt" TEXT;
ALTER TABLE "MotivationPost" ADD COLUMN "textApprovedAt" TIMESTAMP(3);
ALTER TABLE "MotivationPost" ADD COLUMN "imageApprovedAt" TIMESTAMP(3);
UPDATE "MotivationPost" SET "reviewStatus" = CASE
  WHEN "status" = 'published' THEN 'published'::"MotivationReviewStatus"
  WHEN "status" = 'failed' THEN 'failed'::"MotivationReviewStatus"
  ELSE 'discovered'::"MotivationReviewStatus"
END;
ALTER TABLE "MotivationPost" ALTER COLUMN "reviewStatus" SET NOT NULL;
ALTER TABLE "MotivationPost" ALTER COLUMN "reviewStatus" SET DEFAULT 'discovered';

CREATE UNIQUE INDEX "MotivationQuote_normalizedHash_key" ON "MotivationQuote"("normalizedHash");
CREATE INDEX "MotivationQuote_verified_createdAt_idx" ON "MotivationQuote"("verified", "createdAt");
CREATE INDEX "MotivationQuote_sourceType_verified_idx" ON "MotivationQuote"("sourceType", "verified");
CREATE UNIQUE INDEX "MotivationQuoteTranslation_quoteId_language_key" ON "MotivationQuoteTranslation"("quoteId", "language");
CREATE INDEX "MotivationQuoteTranslation_language_idx" ON "MotivationQuoteTranslation"("language");
CREATE INDEX "MotivationQuoteProfile_profileType_idx" ON "MotivationQuoteProfile"("profileType");
CREATE INDEX "MotivationPost_reviewStatus_createdAt_idx" ON "MotivationPost"("reviewStatus", "createdAt");
CREATE INDEX "MotivationPost_quoteId_idx" ON "MotivationPost"("quoteId");
CREATE INDEX "MotivationModerationAudit_postId_createdAt_idx" ON "MotivationModerationAudit"("postId", "createdAt");
CREATE INDEX "MotivationModerationAudit_actorId_createdAt_idx" ON "MotivationModerationAudit"("actorId", "createdAt");

ALTER TABLE "MotivationQuoteTranslation" ADD CONSTRAINT "MotivationQuoteTranslation_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "MotivationQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotivationQuoteProfile" ADD CONSTRAINT "MotivationQuoteProfile_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "MotivationQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotivationPost" ADD CONSTRAINT "MotivationPost_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "MotivationQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MotivationModerationAudit" ADD CONSTRAINT "MotivationModerationAudit_postId_fkey" FOREIGN KEY ("postId") REFERENCES "MotivationPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MotivationModerationAudit" ADD CONSTRAINT "MotivationModerationAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
