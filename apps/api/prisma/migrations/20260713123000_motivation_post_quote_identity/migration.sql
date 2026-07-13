DROP INDEX IF EXISTS "MotivationPost_contentDate_profileType_audienceTrack_key";

CREATE UNIQUE INDEX "MotivationPost_quoteId_key" ON "MotivationPost"("quoteId");
