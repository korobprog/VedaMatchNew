-- CreateEnum
CREATE TYPE "BillingMode" AS ENUM ('beta', 'business');

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "billingMode" "BillingMode" NOT NULL DEFAULT 'business',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);
