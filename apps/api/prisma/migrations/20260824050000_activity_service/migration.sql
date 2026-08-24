-- CreateEnum
CREATE TYPE "public"."ActivityFollowSource" AS ENUM ('union', 'contacts');

-- CreateTable
CREATE TABLE "public"."ActivityFollow" (
    "id" TEXT NOT NULL,
    "granterId" TEXT NOT NULL,
    "granteeId" TEXT NOT NULL,
    "source" "public"."ActivityFollowSource" NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ActivityFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ActivityItem" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityFollow_granteeId_revokedAt_idx" ON "public"."ActivityFollow"("granteeId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityFollow_granterId_granteeId_source_key" ON "public"."ActivityFollow"("granterId", "granteeId", "source");

-- CreateIndex
CREATE INDEX "ActivityItem_actorId_occurredAt_idx" ON "public"."ActivityItem"("actorId", "occurredAt" DESC);

-- AddForeignKey
ALTER TABLE "public"."ActivityFollow" ADD CONSTRAINT "ActivityFollow_granterId_fkey" FOREIGN KEY ("granterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityFollow" ADD CONSTRAINT "ActivityFollow_granteeId_fkey" FOREIGN KEY ("granteeId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ActivityItem" ADD CONSTRAINT "ActivityItem_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
