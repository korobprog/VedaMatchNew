-- «Нравится» у материала Образования (VED-549): своя отметка у каждого и
-- денормализованный счётчик у материала.
ALTER TABLE "LibraryEntry" ADD COLUMN "likeCount" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "LibraryEntryLike" (
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryEntryLike_pkey" PRIMARY KEY ("userId","entryId")
);

CREATE INDEX "LibraryEntryLike_entryId_idx" ON "LibraryEntryLike"("entryId");

ALTER TABLE "LibraryEntryLike" ADD CONSTRAINT "LibraryEntryLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LibraryEntryLike" ADD CONSTRAINT "LibraryEntryLike_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "LibraryEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
