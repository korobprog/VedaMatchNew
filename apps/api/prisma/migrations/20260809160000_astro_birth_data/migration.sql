-- CreateEnum
CREATE TYPE "public"."AstroTimeAccuracy" AS ENUM ('exact', 'approximate', 'unknown');

-- CreateTable
CREATE TABLE "public"."AstroBirthData" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bornAtUtc" TIMESTAMP(3) NOT NULL,
    "birthDateLocal" DATE NOT NULL,
    "birthTimeLocal" TEXT,
    "timeAccuracy" "public"."AstroTimeAccuracy" NOT NULL DEFAULT 'exact',
    "placeLabel" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AstroBirthData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AstroBirthData_userId_key" ON "public"."AstroBirthData"("userId");

-- AddForeignKey
ALTER TABLE "public"."AstroBirthData" ADD CONSTRAINT "AstroBirthData_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
