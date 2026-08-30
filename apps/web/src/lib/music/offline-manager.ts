import type { MusicTrackDto } from "@vedamatch/shared";
import { fetchTrackStreamUrl } from "@/lib/music-playback-api";
import { canFitOffline } from "./offline-capacity";
import {
  deleteOfflineTrack,
  getOfflineTrack,
  listOfflineTrackIds,
  openMusicDb,
  putOfflineTrack,
  type MusicOfflineTrack,
} from "./offline-db";

/**
 * Скачивание записи на устройство. См. docs/music-service-plan.md, этап 9.
 *
 * Ход тот же, что у книг Библиотеки: спросить место, попросить «не вытесняй»,
 * качать с показом прогресса, положить целиком. Разница одна — у записи нет
 * версий и постраничных файлов, поэтому и стадии «собрали и активировали»
 * здесь нет: либо блоб лежит целиком, либо его нет вовсе.
 */

export interface MusicDownloadProgress {
  /** Сколько уже получено, байт. */
  receivedBytes: number;
  /** Сколько всего ожидается; `null` — сервер не сказал длину. */
  totalBytes: number | null;
}

/**
 * Просим браузер не вытеснять хранилище. Не обещание: Safari на iOS всё
 * равно чистит после недели без открытия, если портал не установлен
 * приложением. Поэтому результат никого не блокирует — о риске
 * предупреждает интерфейс словами.
 */
async function requestPersistence(): Promise<void> {
  try {
    await navigator.storage?.persist?.();
  } catch {
    // Приватный режим и запрет хранилища — не повод не качать.
  }
}

async function currentEstimate() {
  try {
    return (await navigator.storage?.estimate?.()) ?? null;
  } catch {
    return null;
  }
}

export async function isTrackSavedOffline(
  userId: string,
  trackId: string,
): Promise<boolean> {
  const db = await openMusicDb(userId);
  return Boolean(await getOfflineTrack(db, trackId));
}

/**
 * Скачать и положить запись. Бросает с человеческим текстом: не хватило
 * места, нет сети, запись сняли с витрины.
 *
 * Только опубликованные: своя запись на модерации может быть отклонена, и
 * офлайн-копия непринятого — это копия того, что портал может не принять.
 */
export async function saveTrackOffline(
  userId: string,
  track: MusicTrackDto,
  onProgress?: (progress: MusicDownloadProgress) => void,
): Promise<MusicOfflineTrack> {
  const estimate = await currentEstimate();
  // Длительность есть всегда, размера в карточке нет: считаем по битрейту с
  // запасом, а точную длину узнаём из заголовка ответа.
  const guessBytes = Math.max(1, Math.round((track.durationSeconds * 320_000) / 8));
  const verdict = canFitOffline(estimate, guessBytes);
  if (!verdict.ok) throw new Error(verdict.reason);

  await requestPersistence();

  // Двумя шагами, а не одним запросом по редиректу. Обращение к порталу
  // обязано идти с cookie, а браузер переносит это требование и на цель
  // редиректа: бакет на запрос с учётными данными не отвечает
  // `Access-Control-Allow-Credentials`, и скачивание падает на CORS —
  // именно так оно и падало в проде, пока плеер играл нормально (`<audio>`
  // редирект проходит без CORS вовсе). Поэтому адрес берём отдельно, а за
  // байтами идём анонимно — как заливка ходит подписанным PUT.
  const { url } = await fetchTrackStreamUrl(track.id);

  const response = await fetch(url, { credentials: "omit" }).catch(() => null);
  if (!response) throw new Error("Не удалось скачать запись: нет связи с хранилищем");
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? "Запись больше не доступна"
        : `Не удалось скачать запись (${response.status})`,
    );
  }

  const declared = Number(response.headers.get("content-length"));
  const totalBytes = Number.isFinite(declared) && declared > 0 ? declared : null;
  const mime = response.headers.get("content-type") ?? "audio/mpeg";

  const body = await readWithProgress(response, totalBytes, onProgress);

  const record: MusicOfflineTrack = {
    trackId: track.id,
    track,
    body,
    sizeBytes: body.size,
    mime,
    savedAt: new Date().toISOString(),
  };

  const db = await openMusicDb(userId);
  await putOfflineTrack(db, record);
  return record;
}

/**
 * Оставить на устройстве только что залитую запись.
 *
 * Файл уже в браузере — тот самый, который человек выбрал в форме. Гонять его
 * обратно из хранилища через `saveTrackOffline` значит скачать сотню мегабайт,
 * которые минуту назад сами туда и уехали.
 *
 * Проверку «только опубликованное» здесь не применяем осознанно: это
 * собственный файл человека, а не чужая запись с витрины. Если модерация её
 * отклонит, сверка `dropRevokedTracks` при следующем открытии портала сотрёт
 * копию сама — тот же механизм, что и для отозванных по жалобе.
 *
 * Место проверяем по настоящему размеру, а не по битрейту: он известен точно.
 */
export async function keepUploadedTrackOffline(
  userId: string,
  track: MusicTrackDto,
  file: Blob,
): Promise<MusicOfflineTrack> {
  const estimate = await currentEstimate();
  const verdict = canFitOffline(estimate, file.size);
  if (!verdict.ok) throw new Error(verdict.reason);

  await requestPersistence();

  const record: MusicOfflineTrack = {
    trackId: track.id,
    track,
    body: file,
    sizeBytes: file.size,
    // У файла с диска тип бывает пустым — браузер не всегда его определяет.
    mime: file.type || "audio/mpeg",
    savedAt: new Date().toISOString(),
  };

  const db = await openMusicDb(userId);
  await putOfflineTrack(db, record);
  return record;
}

/**
 * Чтение с показом прогресса. `response.blob()` отдал бы файл целиком и
 * молча: киртан на сотню мегабайт без полосы выглядит как зависшая
 * страница — тот же довод, что у заливки.
 */
async function readWithProgress(
  response: Response,
  totalBytes: number | null,
  onProgress?: (progress: MusicDownloadProgress) => void,
): Promise<Blob> {
  const reader = response.body?.getReader();
  if (!reader) return response.blob();

  const chunks: BlobPart[] = [];
  let receivedBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value as unknown as BlobPart);
      receivedBytes += value.byteLength;
      onProgress?.({ receivedBytes, totalBytes });
    }
  }
  return new Blob(chunks, {
    type: response.headers.get("content-type") ?? "audio/mpeg",
  });
}

export async function removeTrackOffline(
  userId: string,
  trackId: string,
): Promise<void> {
  const db = await openMusicDb(userId);
  await deleteOfflineTrack(db, trackId);
}

/**
 * Убрать с устройства то, что портал больше не отдаёт.
 *
 * Запись снимают по жалобе или по претензии правообладателя, и обещание
 * убрать её обязано работать и на сохранённых копиях. Проверка идёт при
 * старте с сетью: список своих идентификаторов уходит на сервер, обратно
 * приходят те, что ещё разрешены, — остальные стираем.
 *
 * Ошибка сети ничего не стирает: без ответа сервера мы не знаем, что
 * отозвано, а чистить «на всякий случай» значит отнять у человека музыку
 * ровно тогда, когда он в самолёте.
 */
export async function dropRevokedTracks(
  userId: string,
  stillAllowed: (ids: string[]) => Promise<string[] | null>,
): Promise<string[]> {
  const db = await openMusicDb(userId);
  const saved = await listOfflineTrackIds(db);
  if (saved.length === 0) return [];

  const allowed = await stillAllowed(saved);
  if (allowed === null) return [];

  const keep = new Set(allowed);
  const revoked = saved.filter((id) => !keep.has(id));
  for (const id of revoked) await deleteOfflineTrack(db, id);
  return revoked;
}
