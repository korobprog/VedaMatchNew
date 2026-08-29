-- Демо-каталог «Музыки» — вон.
--
-- Записи заводил `seed:dev`, и файлов за ними нет: `storageKey` указывал в
-- никуда. Пока плеера не было, они честно показывали, как выглядит витрина.
-- Теперь каталог наполняют по-настоящему, а рядом с живыми записями молчащая
-- плитка читается как сломанная запись, а не как заглушка.
--
-- Условие бьёт ровно по ключам, которые заводил сеятель, — `music/demo/N.mp3`.
-- Подписанный PUT кладёт файл под `music/<uuid>/…`, так что живую загрузку
-- это не заденет ни в одной среде.
DELETE FROM "MusicTrack" WHERE "storageKey" LIKE 'music/demo/%';

-- Позиции в плейлистах и отметки «нравится» уходят каскадом, а вот
-- денормализованный счётчик — нет: он остался бы считать удалённое.
UPDATE "MusicPlaylist" p
   SET "trackCount" = (
     SELECT count(*) FROM "MusicPlaylistItem" i WHERE i."playlistId" = p.id
   )
 WHERE p."trackCount" <> (
     SELECT count(*) FROM "MusicPlaylistItem" i WHERE i."playlistId" = p.id
   );

-- Демо-альбом и демо-исполнители: только если за ними ничего не осталось.
-- Кто-то мог загрузить настоящую запись под тем же исполнителем — тогда он
-- живой, и трогать его нельзя.
DELETE FROM "MusicAlbum" a
 WHERE a.slug = 'evening-program-minsk'
   AND NOT EXISTS (SELECT 1 FROM "MusicTrack" t WHERE t."albumId" = a.id);

DELETE FROM "MusicArtist" ar
 WHERE ar.slug IN (
     'audarya-dhama-das', 'minsk-yatra-choir', 'prema-bhakti-dd',
     'gaurachandra-das', 'yatra-sankirtan'
   )
   AND NOT EXISTS (SELECT 1 FROM "MusicTrack" t WHERE t."artistId" = ar.id)
   AND NOT EXISTS (SELECT 1 FROM "MusicAlbum" al WHERE al."artistId" = ar.id);
