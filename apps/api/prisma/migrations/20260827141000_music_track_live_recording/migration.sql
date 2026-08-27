-- «Запись с программы» — значок на карточке трека из мокапов сервиса.
-- Признак у трека, а не у альбома: киртан, вырезанный из программы, живёт в
-- каталоге без альбома и значок носит всё равно.
ALTER TABLE "public"."MusicTrack" ADD COLUMN "isLiveRecording" BOOLEAN NOT NULL DEFAULT false;
