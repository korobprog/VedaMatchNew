-- CreateTable
CREATE TABLE "UnionArchive" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "archivedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnionArchive_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UnionArchive_ownerId_archivedUserId_key" ON "UnionArchive"("ownerId", "archivedUserId");

-- CreateIndex
CREATE INDEX "UnionArchive_ownerId_createdAt_idx" ON "UnionArchive"("ownerId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "UnionArchive" ADD CONSTRAINT "UnionArchive_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UnionArchive" ADD CONSTRAINT "UnionArchive_archivedUserId_fkey" FOREIGN KEY ("archivedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
