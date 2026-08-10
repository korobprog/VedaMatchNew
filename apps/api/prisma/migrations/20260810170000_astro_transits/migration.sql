-- AlterTable
ALTER TABLE "public"."NotificationPreference" ADD COLUMN     "transits" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "public"."AstroTransitDigest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "forDate" DATE NOT NULL,
    "data" JSONB NOT NULL,
    "text" TEXT,
    "pushedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AstroTransitDigest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AstroTransitPhrase" (
    "id" TEXT NOT NULL,
    "patternKey" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AstroTransitPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AstroTransitDigest_userId_forDate_key" ON "public"."AstroTransitDigest"("userId", "forDate");

-- CreateIndex
CREATE UNIQUE INDEX "AstroTransitPhrase_patternKey_locale_promptVersion_key" ON "public"."AstroTransitPhrase"("patternKey", "locale", "promptVersion");

-- AddForeignKey
ALTER TABLE "public"."AstroTransitDigest" ADD CONSTRAINT "AstroTransitDigest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

