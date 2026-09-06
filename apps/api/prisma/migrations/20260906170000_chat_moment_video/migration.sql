-- AlterEnum
ALTER TYPE "public"."ChatMomentKind" ADD VALUE 'video';

-- AlterTable
ALTER TABLE "public"."ChatMoment" ADD COLUMN     "durationSec" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "previewKey" TEXT,
ADD COLUMN     "previewUrl" TEXT,
ADD COLUMN     "sizeBytes" INTEGER;
