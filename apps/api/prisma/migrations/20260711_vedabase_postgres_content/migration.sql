CREATE TYPE "VedabaseImportStatus" AS ENUM ('staging', 'validated', 'active', 'failed');

CREATE TABLE "VedabaseBook" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "title" TEXT NOT NULL,
  "author" TEXT, "language" TEXT NOT NULL, "cover" JSONB,
  "sourceUrl" TEXT NOT NULL, "attribution" TEXT NOT NULL,
  "activeVersionId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "VedabaseBook_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VedabaseBookVersion" (
  "id" TEXT NOT NULL, "bookId" TEXT NOT NULL, "contentVersion" TEXT NOT NULL,
  "formatVersion" INTEGER NOT NULL, "status" "VedabaseImportStatus" NOT NULL DEFAULT 'staging',
  "permissionRef" TEXT NOT NULL, "attribution" TEXT NOT NULL, "importedAt" TIMESTAMP(3) NOT NULL,
  "sizeBytes" BIGINT NOT NULL, "packageChecksum" TEXT NOT NULL, "chapterCount" INTEGER NOT NULL,
  "searchableUnitCount" INTEGER NOT NULL, "searchIndexBytes" INTEGER NOT NULL,
  "searchIndexSha256" TEXT NOT NULL, "coverBytes" INTEGER, "coverSha256" TEXT,
  "errorMessage" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "VedabaseBookVersion_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VedabaseChapter" (
  "id" TEXT NOT NULL, "versionId" TEXT NOT NULL, "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL, "order" INTEGER NOT NULL, "payload" JSONB NOT NULL,
  "bytes" INTEGER NOT NULL, "sha256" TEXT NOT NULL, CONSTRAINT "VedabaseChapter_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VedabaseSearchUnit" (
  "id" TEXT NOT NULL, "versionId" TEXT NOT NULL, "chapterSlug" TEXT NOT NULL,
  "locator" JSONB NOT NULL, "title" TEXT NOT NULL, "text" TEXT NOT NULL,
  CONSTRAINT "VedabaseSearchUnit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VedabaseBook_slug_key" ON "VedabaseBook"("slug");
CREATE UNIQUE INDEX "VedabaseBook_activeVersionId_key" ON "VedabaseBook"("activeVersionId");
CREATE UNIQUE INDEX "VedabaseBookVersion_bookId_contentVersion_key" ON "VedabaseBookVersion"("bookId", "contentVersion");
CREATE INDEX "VedabaseBookVersion_status_updatedAt_idx" ON "VedabaseBookVersion"("status", "updatedAt");
CREATE UNIQUE INDEX "VedabaseChapter_versionId_slug_key" ON "VedabaseChapter"("versionId", "slug");
CREATE UNIQUE INDEX "VedabaseChapter_versionId_order_key" ON "VedabaseChapter"("versionId", "order");
CREATE INDEX "VedabaseSearchUnit_versionId_chapterSlug_idx" ON "VedabaseSearchUnit"("versionId", "chapterSlug");
CREATE INDEX "VedabaseSearchUnit_text_fts_idx" ON "VedabaseSearchUnit" USING GIN (to_tsvector('russian', "text"));
ALTER TABLE "VedabaseBookVersion" ADD CONSTRAINT "VedabaseBookVersion_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "VedabaseBook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VedabaseChapter" ADD CONSTRAINT "VedabaseChapter_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VedabaseBookVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VedabaseSearchUnit" ADD CONSTRAINT "VedabaseSearchUnit_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "VedabaseBookVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VedabaseBook" ADD CONSTRAINT "VedabaseBook_activeVersionId_fkey" FOREIGN KEY ("activeVersionId") REFERENCES "VedabaseBookVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
