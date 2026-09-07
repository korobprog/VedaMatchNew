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
  MusicUploadRightsBasis,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

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
): Promise<CompleteMusicUploadResponse> {
  const created = await send<CreateMusicUploadResponse>("/music/uploads", {
    method: "POST",
    body: JSON.stringify({
      fileName: file.name,
      mime: file.type,
      sizeBytes: file.size,
      rightsBasis,
    }),
  });

  await putWithProgress(created.url, file, onProgress);

  return send<CompleteMusicUploadResponse>(
    `/music/uploads/${created.uploadId}/complete`,
    {
      method: "POST",
      body: JSON.stringify({ fileName: file.name, lineage }),
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
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    // Content-Type входит в подпись: разойдётся — S3 ответит 403, и понять
    // это по логам браузера крайне неприятно.
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Хранилище отказало (${xhr.status})`));
    xhr.onerror = () => reject(new Error("Не удалось передать файл"));
    xhr.send(file);
  });
}
