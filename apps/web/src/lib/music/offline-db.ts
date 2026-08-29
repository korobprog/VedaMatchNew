import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { MusicTrackDto } from "@vedamatch/shared";

/**
 * Офлайн-хранилище Музыки. См. docs/music-service-plan.md, этап 9.
 *
 * Устроено по образцу Библиотеки (`lib/vedabase/local-db.ts`): та же
 * пользовательская база, тот же приём с учётом открытых соединений. Свой
 * модуль, а не общий с ней: контракт сервисного модуля не велит сервисам
 * ходить в чужие файлы, а книга и запись хранятся по-разному — у книги
 * версии и постраничные файлы, у записи один блоб.
 *
 * Байты, а не ссылки. Звук отдаётся 302-редиректом на подписанный адрес S3,
 * который живёт шесть часов: закешировать URL значит завтра получить
 * протухший. Поэтому в базе лежит сам файл.
 *
 * Блоб, а не Cache API. Закешированный `Response` не отвечает на диапазонные
 * запросы, а `<audio>` при перемотке спрашивает именно диапазоны — на iOS
 * это ломает перемотку целиком. По локальному блобу браузер перематывает
 * сам, и service worker в воспроизведении не участвует вовсе.
 */
const databasePrefix = "vedamatch-music:";
const databaseVersion = 1;
const activeConnections = new Map<string, Set<IDBPDatabase<MusicDbSchema>>>();

/**
 * Сохранённая запись. Карточка лежит рядом с блобом: без сети её негде
 * взять, а список сохранённого должен открываться и в самолёте.
 */
export interface MusicOfflineTrack {
  trackId: string;
  /** Карточка на момент сохранения: название, исполнитель, длительность. */
  track: MusicTrackDto;
  body: Blob;
  sizeBytes: number;
  mime: string;
  savedAt: string;
}

interface MusicDbSchema extends DBSchema {
  tracks: { key: string; value: MusicOfflineTrack };
}

export type MusicDb = IDBPDatabase<MusicDbSchema>;

export function musicDatabaseName(userId: string): string {
  if (userId.trim().length === 0) {
    throw new Error("Для офлайн-хранилища Музыки нужен идентификатор человека");
  }
  return `${databasePrefix}${userId}`;
}

export async function openMusicDb(userId: string): Promise<MusicDb> {
  const name = musicDatabaseName(userId);
  const database = await openDB<MusicDbSchema>(name, databaseVersion, {
    upgrade(db) {
      db.createObjectStore("tracks", { keyPath: "trackId" });
    },
    blocking() {
      database.close();
      activeConnections.get(name)?.delete(database);
    },
    terminated() {
      activeConnections.get(name)?.delete(database);
    },
  });

  const connections = activeConnections.get(name) ?? new Set<MusicDb>();
  connections.add(database);
  activeConnections.set(name, connections);
  return database;
}

/** Закрыть и удалить хранилище — при выходе из аккаунта. */
export async function dropMusicDb(userId: string): Promise<void> {
  const name = musicDatabaseName(userId);
  for (const connection of activeConnections.get(name) ?? []) connection.close();
  activeConnections.delete(name);
  await deleteDB(name);
}

export async function putOfflineTrack(
  db: MusicDb,
  record: MusicOfflineTrack,
): Promise<void> {
  await db.put("tracks", record);
}

export async function getOfflineTrack(
  db: MusicDb,
  trackId: string,
): Promise<MusicOfflineTrack | undefined> {
  return db.get("tracks", trackId);
}

export async function deleteOfflineTrack(
  db: MusicDb,
  trackId: string,
): Promise<void> {
  await db.delete("tracks", trackId);
}

export async function listOfflineTracks(
  db: MusicDb,
): Promise<MusicOfflineTrack[]> {
  const rows = await db.getAll("tracks");
  // Свежие сверху: список сохранённого читают, чтобы освободить место, и
  // последнее скачанное вспоминается лучше всего.
  return rows.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function listOfflineTrackIds(db: MusicDb): Promise<string[]> {
  return db.getAllKeys("tracks") as Promise<string[]>;
}

/**
 * Найти сохранённую запись, не заставляя зовущего открывать базу.
 * Нужна плееру: он спрашивает про локальную копию на каждой смене записи.
 */
export async function findSavedTrack(
  userId: string,
  trackId: string,
): Promise<MusicOfflineTrack | undefined> {
  const db = await openMusicDb(userId);
  return getOfflineTrack(db, trackId);
}
