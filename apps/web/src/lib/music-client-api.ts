// Браузерный клиент сервиса «Музыка»: загрузка записей и свои файлы.
//
// Отдельно от `music-api.ts`: там `next/headers`, и в клиентский компонент
// такой модуль не втащить — сборка падает. Отдельно от
// `music-admin-client-api.ts`: загружать может любой вошедший, а не только
// редакция; админского здесь ничего нет.
//
// Файл идёт мимо API: сервер выдаёт подписанный PUT, браузер льёт прямо в
// бакет и возвращается за `complete`. Киртан на сотню мегабайт через Nest в
// буфере не пройдёт.
import type {
  CompleteMusicUploadResponse,
  LineageId,
  CreateMusicCoverUploadResponse,
  CreateMusicReportRequest,
  CreateMusicUploadResponse,
  MusicCoverScope,
  MusicReportResultDto,
  MusicStorageUsageDto,
  MusicUploadRightsBasis,
  MusicUploadStateDto,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";
import {
  UploadNetworkError,
  backoffDelay,
  isPageReady,
  isRetryableUploadError,
  presignExpired,
  waitUntilVisibleAndOnline,
} from "@/lib/music-upload-retry";

async function send<T>(path: string, init: RequestInit): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    // Сообщение от API человеку понятнее «HTTP 400»: там написано, что
    // именно не так с файлом.
    const body = (await res.json().catch(() => null)) as {
      message?: string;
    } | null;
    throw new Error(
      body?.message ?? `Не удалось выполнить запрос (${res.status})`,
    );
  }
  return (await res.json()) as T;
}

/** Сколько места занято и сколько можно (VED: квота загрузок). */
export async function fetchMusicUploadUsage(): Promise<MusicStorageUsageDto> {
  const res = await apiFetch(`${API_URL}/music/uploads/usage`);
  if (!res.ok)
    throw new Error(`Не удалось узнать свободное место (${res.status})`);
  return (await res.json()) as MusicStorageUsageDto;
}

/**
 * Где загрузка сейчас — форма спрашивает, пока FLAC, WAV или OGG
 * перекодируется на сервере (VED-244).
 */
export async function fetchMusicUploadState(
  uploadId: string,
): Promise<MusicUploadStateDto> {
  const res = await apiFetch(
    `${API_URL}/music/uploads/${encodeURIComponent(uploadId)}`,
  );
  if (!res.ok)
    throw new Error(`Не удалось узнать, что с загрузкой (${res.status})`);
  return (await res.json()) as MusicUploadStateDto;
}

/**
 * Заливка записи целиком: заявка → PUT в бакет → завершение.
 *
 * `onProgress` получает долю от 0 до 1. Прогресс считается по
 * `XMLHttpRequest`, а не по `fetch`: у `fetch` нет событий отправки тела, а
 * заливка на сто мегабайт без полосы выглядит как зависшая страница.
 */
export async function uploadMusicTrack(
  file: File,
  rightsBasis: MusicUploadRightsBasis,
  onProgress?: (fraction: number) => void,
  /**
   * Матх или линия записи. `null` (и по умолчанию) — слышат все: сервер
   * линию не угадывает, см. `CompleteMusicUploadRequest`.
   */
  lineage: LineageId | null = null,
  /**
   * Исполнитель из справочника — загрузка со страницы исполнителя (VED-114).
   * Сервер учитывает его только от редакции Музыки.
   */
  artistId: string | null = null,
  /**
   * Книга, в конец которой встаёт запись главой (VED-297) — загрузка из
   * редактора книги. Сервер учитывает её только от редакции Музыки.
   */
  audiobookId: string | null = null,
  /**
   * `onWaiting(true)` — обрыв случился, пока страница скрыта или нет связи:
   * ждём возвращения, прежде чем лить заново; `false` — дождались.
   */
  options: { onWaiting?: (waiting: boolean) => void } = {},
): Promise<CompleteMusicUploadResponse> {
  const requestUpload = () =>
    send<CreateMusicUploadResponse>("/music/uploads", {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        mime: file.type,
        sizeBytes: file.size,
        rightsBasis,
      }),
    });
  let created = await requestUpload();
  let issuedAt = Date.now();

  // Обрыв сети (телефон приостановил страницу) — не окончательная ошибка:
  // ждём возвращения и льём заново. Частичный PUT в S3 не докачать, поэтому
  // каждая попытка — с нуля, а если подпись успела истечь, берём новую.
  for (let attempt = 1; ; attempt += 1) {
    try {
      await putWithProgress(
        created.url,
        file,
        onProgress,
        created.headers["Content-Type"],
      );
      break;
    } catch (cause) {
      const delay = backoffDelay(attempt);
      if (delay === null || !isRetryableUploadError(cause)) throw cause;
      onProgress?.(0);
      if (!isPageReady(document, navigator)) {
        options.onWaiting?.(true);
        try {
          await waitUntilVisibleAndOnline(document, navigator, window);
        } finally {
          options.onWaiting?.(false);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      if (presignExpired(issuedAt, Date.now(), created.expiresInSeconds)) {
        created = await requestUpload();
        issuedAt = Date.now();
      }
    }
  }

  return send<CompleteMusicUploadResponse>(
    `/music/uploads/${created.uploadId}/complete`,
    {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        lineage,
        ...(artistId ? { artistId } : {}),
        ...(audiobookId ? { audiobookId } : {}),
      }),
    },
  );
}

/**
 * Заливка обложки: заявка → PUT в бакет → ключ.
 *
 * «Завершения» здесь нет намеренно: ключ ничего не значит, пока его не
 * сохранят в карточке. Поэтому вызывающий обязан положить возвращённое в
 * `coverKey` своей формы — иначе картинка останется лежать ничьей.
 */
export async function uploadMusicCover(
  file: File,
  scope: MusicCoverScope,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const created = await send<CreateMusicCoverUploadResponse>("/music/covers", {
    method: "POST",
    body: JSON.stringify({
      scope,
      mime: file.type,
      sizeBytes: file.size,
    }),
  });

  await putWithProgress(created.url, file, onProgress);

  return created.coverKey;
}

/** Пожаловаться на запись. Три обычные жалобы скрывают её, одна о правах — сразу. */
export const reportMusicTrack = (body: CreateMusicReportRequest) =>
  send<MusicReportResultDto>("/music/reports", {
    method: "POST",
    body: JSON.stringify(body),
  });

/** Снять свою неопубликованную запись и освободить место. */
export const deleteMyMusicTrack = (trackId: string) =>
  send<{ ok: true }>(`/music/uploads/tracks/${trackId}`, { method: "DELETE" });

function putWithProgress(
  url: string,
  file: File,
  onProgress?: (fraction: number) => void,
  /**
   * Тип, под который сервер подписал ссылку. Он может отличаться от
   * `file.type`: `audio/x-m4a` сервер приводит к `audio/mp4` (VED-195).
   */
  contentType: string = file.type,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // Content-Type входит в подпись: разойдётся — S3 ответит 403, и понять
    // это по логам браузера крайне неприятно.
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Хранилище отказало (${xhr.status})`));
    // Обрыв, отмена и таймаут — сеть или приостановленная страница, а не
    // ответ хранилища: такие ошибки вызывающий может повторить.
    xhr.onerror = () => reject(new UploadNetworkError());
    xhr.onabort = () => reject(new UploadNetworkError());
    xhr.ontimeout = () => reject(new UploadNetworkError());
    xhr.send(file);
  });
}
