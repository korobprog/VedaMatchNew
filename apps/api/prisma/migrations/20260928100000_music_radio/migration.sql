-- «Радио VM» (VED-437): расписание эфира, голосовые вставки, слушатели.
-- CreateTable
CREATE TABLE "MusicRadioSlot" (
    "id" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "trackId" TEXT,
    "insertId" TEXT,
    "cycle" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicRadioSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicRadioInsert" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicRadioInsert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicRadioListener" (
    "userId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicRadioListener_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "MusicRadioSlot_startsAt_idx" ON "MusicRadioSlot"("startsAt");

-- CreateIndex
CREATE INDEX "MusicRadioSlot_cycle_idx" ON "MusicRadioSlot"("cycle");

-- CreateIndex
CREATE INDEX "MusicRadioSlot_insertId_idx" ON "MusicRadioSlot"("insertId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicRadioInsert_storageKey_key" ON "MusicRadioInsert"("storageKey");

-- CreateIndex
CREATE INDEX "MusicRadioInsert_scheduledAt_idx" ON "MusicRadioInsert"("scheduledAt");

-- CreateIndex
CREATE INDEX "MusicRadioListener_lastSeenAt_idx" ON "MusicRadioListener"("lastSeenAt");

-- AddForeignKey
ALTER TABLE "MusicRadioSlot" ADD CONSTRAINT "MusicRadioSlot_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "MusicTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicRadioSlot" ADD CONSTRAINT "MusicRadioSlot_insertId_fkey" FOREIGN KEY ("insertId") REFERENCES "MusicRadioInsert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicRadioInsert" ADD CONSTRAINT "MusicRadioInsert_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicRadioListener" ADD CONSTRAINT "MusicRadioListener_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

