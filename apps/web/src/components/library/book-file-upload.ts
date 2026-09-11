// Браузерный клиент файлов книг Образования: заливка и снятие.
//
// Файл идёт мимо API: сервер выдаёт подписанный PUT, браузер льёт прямо в
// бакет и возвращается за завершением. Скан книги на сотню мегабайт через
// Nest в буфере не пройдёт. Приём тот же, что в Музыке
// (lib/music-client-api.ts); чужой сервис не импортируем — копия осознанная.
import type {
  CompleteLibraryBookUploadRequest,
  CreateLibraryBookUploadRequest,
  LibraryBookUploadResponse,
  LibraryEntryFileDto,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";

/** Отказ с кодом API — по коду форма называет причину словами. */
export class BookUploadError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "BookUploadError";
  }
}

/** Код ошибки из тела Nest (`message` строкой или массивом) либо код ответа. */
async function failureCode(res: Response): Promise<string> {
  const payload = (await res.json().catch(() => null)) as {
    message?: unknown;
  } | null;
  const code = Array.isArray(payload?.message)
    ? payload?.message[0]
    : payload?.message;
  return typeof code === "string" && code ? code : String(res.status);
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new BookUploadError(await failureCode(res));
  return (await res.json()) as T;
}

/**
 * Прикрепить файл книги к материалу: заявка → PUT в бакет → завершение.
 *
 * `onProgress` получает долю от 0 до 1. Прогресс считается по
 * `XMLHttpRequest`: у `fetch` нет событий отправки тела, а заливка на сто
 * мегабайт без полосы выглядит как зависшая страница.
 */
export async function uploadBookFile(
  entryId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<LibraryEntryFileDto> {
  const request: CreateLibraryBookUploadRequest = {
    fileName: file.name,
    sizeBytes: file.size,
  };
  const upload = await post<LibraryBookUploadResponse>(
    `/library/entries/${entryId}/files/upload`,
    request,
  );

  await putWithProgress(upload, file, onProgress);

  const complete: CompleteLibraryBookUploadRequest = {
    key: upload.key,
    fileName: file.name,
  };
  return post<LibraryEntryFileDto>(
    `/library/entries/${entryId}/files`,
    complete,
  );
}

/** Убрать файл из материала. */
export async function deleteBookFile(
  entryId: string,
  fileId: string,
): Promise<void> {
  const res = await apiFetch(
    `${API_URL}/library/entries/${entryId}/files/${fileId}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) throw new BookUploadError(await failureCode(res));
}

function putWithProgress(
  upload: LibraryBookUploadResponse,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload.url);
    // Заголовки — из ответа сервера, а не `file.type`: они вошли в подпись,
    // а для djvu, fb2 и mobi браузер тип файла вообще не знает. Разойдутся —
    // S3 ответит 403.
    for (const [name, value] of Object.entries(upload.headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(event.loaded / event.total);
      }
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new BookUploadError("storage_rejected"));
    xhr.onerror = () => reject(new BookUploadError("network"));
    xhr.send(file);
  });
}
