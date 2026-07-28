-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false;
