-- CreateEnum
CREATE TYPE "GitabaseAnnotationKind" AS ENUM ('highlight', 'note');

-- CreateTable
CREATE TABLE "GitabaseReadingProgress" (
    "userId" TEXT NOT NULL,
    "bookSlug" TEXT NOT NULL,
    "locator" JSONB NOT NULL,
    "percentage" INTEGER NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitabaseReadingProgress_pkey" PRIMARY KEY ("userId", "bookSlug")
);

-- CreateTable
CREATE TABLE "GitabaseBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookSlug" TEXT NOT NULL,
    "locator" JSONB NOT NULL,
    "label" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitabaseBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitabaseAnnotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookSlug" TEXT NOT NULL,
    "kind" "GitabaseAnnotationKind" NOT NULL,
    "locator" JSONB NOT NULL,
    "range" JSONB NOT NULL,
    "color" TEXT,
    "noteText" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GitabaseAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitabaseAnnotationRevision" (
    "id" TEXT NOT NULL,
    "annotationId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "noteText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitabaseAnnotationRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GitabaseSyncMutation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientMutationId" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GitabaseSyncMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GitabaseReadingProgress_userId_updatedAt_idx" ON "GitabaseReadingProgress"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "GitabaseBookmark_userId_bookSlug_idx" ON "GitabaseBookmark"("userId", "bookSlug");

-- CreateIndex
CREATE INDEX "GitabaseBookmark_userId_updatedAt_idx" ON "GitabaseBookmark"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "GitabaseAnnotation_userId_bookSlug_idx" ON "GitabaseAnnotation"("userId", "bookSlug");

-- CreateIndex
CREATE INDEX "GitabaseAnnotation_userId_updatedAt_idx" ON "GitabaseAnnotation"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GitabaseAnnotationRevision_annotationId_revision_key" ON "GitabaseAnnotationRevision"("annotationId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "GitabaseSyncMutation_userId_clientMutationId_key" ON "GitabaseSyncMutation"("userId", "clientMutationId");

-- CreateIndex
CREATE INDEX "GitabaseSyncMutation_userId_createdAt_id_idx" ON "GitabaseSyncMutation"("userId", "createdAt", "id");

-- AddForeignKey
ALTER TABLE "GitabaseReadingProgress" ADD CONSTRAINT "GitabaseReadingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitabaseBookmark" ADD CONSTRAINT "GitabaseBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitabaseAnnotation" ADD CONSTRAINT "GitabaseAnnotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitabaseAnnotationRevision" ADD CONSTRAINT "GitabaseAnnotationRevision_annotationId_fkey" FOREIGN KEY ("annotationId") REFERENCES "GitabaseAnnotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GitabaseSyncMutation" ADD CONSTRAINT "GitabaseSyncMutation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
