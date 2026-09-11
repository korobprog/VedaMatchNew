-- VED-88: очередь плеера хранится на сервере. Без неё «назад» и «вперёд» на
-- главной были мертвы после закрытой полосы плеера и на другом устройстве:
-- состояние с сервера приходило с одной записью.
CREATE TABLE "MusicPlaybackQueue" (
  "userId"    TEXT NOT NULL,
  "trackIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MusicPlaybackQueue_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "MusicPlaybackQueue"
  ADD CONSTRAINT "MusicPlaybackQueue_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
