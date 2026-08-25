-- CreateTable
CREATE TABLE "UnionFavorite" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "favoriteUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnionFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnionFavorite_ownerId_favoriteUserId_key" ON "UnionFavorite"("ownerId", "favoriteUserId");

-- CreateIndex
CREATE INDEX "UnionFavorite_ownerId_createdAt_idx" ON "UnionFavorite"("ownerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "UnionFavorite" ADD CONSTRAINT "UnionFavorite_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnionFavorite" ADD CONSTRAINT "UnionFavorite_favoriteUserId_fkey" FOREIGN KEY ("favoriteUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
