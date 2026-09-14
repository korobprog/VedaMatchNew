-- VED-137: картинки к новостям.
CREATE TABLE "public"."AnnouncementImage" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementImage_storageKey_key" ON "public"."AnnouncementImage"("storageKey");

-- CreateIndex
CREATE INDEX "AnnouncementImage_announcementId_sortOrder_idx" ON "public"."AnnouncementImage"("announcementId", "sortOrder");

-- AddForeignKey
ALTER TABLE "public"."AnnouncementImage" ADD CONSTRAINT "AnnouncementImage_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "public"."Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
