ALTER TABLE "MotivationQuote" ADD COLUMN "discoveryDate" DATE;

CREATE INDEX "MotivationQuote_discoveryDate_verified_idx" ON "MotivationQuote"("discoveryDate", "verified");
