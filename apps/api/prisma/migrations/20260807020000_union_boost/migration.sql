-- CreateTable
CREATE TABLE "public"."UnionBoost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnionBoost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UnionBoost_userId_expiresAt_idx" ON "public"."UnionBoost"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "UnionBoost_expiresAt_idx" ON "public"."UnionBoost"("expiresAt");

-- AddForeignKey
ALTER TABLE "public"."UnionBoost" ADD CONSTRAINT "UnionBoost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
