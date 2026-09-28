-- Музыка: приём FLAC, WAV и OGG с перекодированием на сервере (VED-244).
ALTER TYPE "MusicUploadStatus" ADD VALUE IF NOT EXISTS 'transcode_queued';
ALTER TYPE "MusicUploadStatus" ADD VALUE IF NOT EXISTS 'transcoding';

ALTER TABLE "MusicUpload" ADD COLUMN "transcodeAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MusicUpload" ADD COLUMN "transcodeRequest" JSONB;
