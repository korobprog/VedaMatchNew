-- Подборка портала переживает уход своего автора.
--
-- Владелец у плейлиста был обязателен и каскадный: удаление аккаунта
-- администратора, заведшего «Утренний киртан», уносило подборку у всех.
-- Теперь связь SetNull — как у записи, которую опубликовали и чей автор ушёл.
--
-- Свои (несистемные) плейлисты человека при удалении аккаунта снимает
-- MusicPurgeListener: без этого они остались бы висеть ничьими.

ALTER TABLE "public"."MusicPlaylist" ALTER COLUMN "ownerId" DROP NOT NULL;

ALTER TABLE "public"."MusicPlaylist" DROP CONSTRAINT "MusicPlaylist_ownerId_fkey";

ALTER TABLE "public"."MusicPlaylist" ADD CONSTRAINT "MusicPlaylist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
