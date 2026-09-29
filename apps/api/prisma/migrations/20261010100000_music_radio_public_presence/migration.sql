-- VED-645: показывать ли человека на публичной странице радио.
ALTER TABLE "MusicSettings" ADD COLUMN "radioPublicPresence" BOOLEAN NOT NULL DEFAULT true;
