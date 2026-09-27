-- Папки авторов в фильтре ленты Вдохновения (VED-584).
CREATE TYPE "MotivationSpeakerFolderKind" AS ENUM ('world_wisdom', 'vedas');

CREATE TABLE "MotivationSpeakerFolder" (
    "speakerKey" TEXT NOT NULL,
    "folder" "MotivationSpeakerFolderKind" NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MotivationSpeakerFolder_pkey" PRIMARY KEY ("speakerKey")
);
