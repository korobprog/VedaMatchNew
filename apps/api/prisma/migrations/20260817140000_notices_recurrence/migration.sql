-- CreateEnum
CREATE TYPE "public"."NoticeRecurrence" AS ENUM ('none', 'weekly', 'biweekly', 'monthly', 'ekadashi');

-- AlterTable
ALTER TABLE "public"."Notice" ADD COLUMN     "repeat" "public"."NoticeRecurrence" NOT NULL DEFAULT 'none',
ADD COLUMN     "repeatUntil" TIMESTAMP(3);
