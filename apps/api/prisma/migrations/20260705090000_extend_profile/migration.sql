ALTER TABLE "User"
ADD COLUMN "avatarKey" TEXT,
ADD COLUMN "homeLocation" JSONB,
ADD COLUMN "socialLinks" JSONB,
ADD COLUMN "messengers" JSONB;
