-- CreateEnum
CREATE TYPE "public"."UserAccountStatus" AS ENUM ('active', 'blocked', 'deleted');

-- AlterTable
ALTER TABLE "public"."User" ADD COLUMN     "accountStatus" "public"."UserAccountStatus" NOT NULL DEFAULT 'active',
ADD COLUMN     "blockedUntil" TIMESTAMP(3),
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "pendingDeletionAt" TIMESTAMP(3),
ADD COLUMN     "statusActor" "public"."StageChangeActor",
ADD COLUMN     "statusChangedAt" TIMESTAMP(3),
ADD COLUMN     "statusReason" TEXT;
