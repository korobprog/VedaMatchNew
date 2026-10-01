// Браузерный клиент файлов личной страницы (VED-686, часть 2): заливка и
// снятие. Схема как у книг Библиотеки: сервер выдаёт подписанный PUT, браузер
// льёт прямо в бакет и возвращается за завершением. Копия осознанная —
// чужой сервис не импортируем.
import {
  BLOG_AUTHOR_FILE_FORMATS,
  BLOG_AUTHOR_FILE_MAX_BYTES,
  BLOG_AUTHOR_FILES_MAX,
  blogAuthorFileFormatOf,
} from "@vedamatch/shared";
import type {
  BlogAuthorFileDto,
  BlogAuthorFileUploadResponse,
  CompleteBlogAuthorFileUploadRequest,
  CreateBlogAuthorFileUploadRequest,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";
import {
  UploadNetworkError,
  UPLOAD_INTERRUPTED_MESSAGE,
  backoffDelay,
  isPageReady,
  keepScreenAwake,
  waitUntilVisibleAndOnline,
} from "@/lib/music-upload-retry";

/** Отказ с кодом API или клиента. */
export class AuthorFileError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "AuthorFileError";
  }
}

/** Значение `accept` для окна выбора файла. */
export const AUTHOR_FILE_ACCEPT = [
  ...Object.keys(BLOG_AUTHOR_FILE_FORMATS).map((ext) => `.${ext}`),
  ".djv",
].join(",");

/** «2,4 МБ», «640 КБ» — без `Intl`, чтобы сервер и браузер совпали. */
export function formatBytes(bytes: number): string {
  const units = ["Б", "КБ", "МБ", "ГБ"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits).replace(".", ",")} ${units[unit]}`;
}

/** Отказ до заливки — тот же, что дал бы сервер; `null` — можно лить. */
export function authorFilePreflight(
  file: { name: string; size: number },
  filesCount: number,
): string | null {
  const format = blogAuthorFileFormatOf(file.name);
  if (!format) return "unsupported_file_format";
  if (file.size <= 0) return "file_empty";
  if (
    file.size > BLOG_AUTHOR_FILE_MAX_BYTES[BLOG_AUTHOR_FILE_FORMATS[format]]
  ) {
    return "file_too_large";
  }
  if (filesCount >= BLOG_AUTHOR_FILES_MAX) return "too_many_files";
  return null;
}

const MESSAGES: Record<string, string> = {
  unsupported_file_format:
    "Такой формат не принимаем. Подходят аудио, видео и документы.",
  file_empty: "Файл пустой.",
  file_too_large: "Файл слишком большой.",
  too_many_files: `На странице уже ${BLOG_AUTHOR_FILES_MAX} файлов — уберите лишний.`,
  file_missing: "Файл не дошёл до хранилища. Попробуйте ещё раз.",
  file_key_mismatch: "Файл не удалось привязать. Попробуйте ещё раз.",
  file_not_found: "Файл уже удалён.",
  file_upload_unavailable: "Хранилище файлов сейчас недоступно.",
  storage_rejected: "Хранилище отклонило файл. Попробуйте ещё раз.",
  network: "Нет связи — файл не загрузился.",
  // То же словами, что у загрузки записи (VED-684): причина обрыва одна и
  // та же — телефон приостановил страницу.
  upload_interrupted: UPLOAD_INTERRUPTED_MESSAGE,
};

/** Отказ словами; незнакомый код — «не загрузился». */
export function authorFileErrorText(code: string): string {
  return MESSAGES[code] ?? "Файл не загрузился. Попробуйте ещё раз.";
}

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
  if (!res.ok) throw new AuthorFileError(await failureCode(res));
  return (await res.json()) as T;
}

/**
 * Загрузить файл на свою страницу: заявка → PUT в бакет → завершение.
 * `onProgress` получает долю от 0 до 1 (по `XMLHttpRequest`: у `fetch` нет
 * событий отправки тела).
 *
 * Обрыв при свёрнутом приложении — не окончательная ошибка (VED-684):
 * заливка ждёт возвращения в приложение и связи и продолжается сама — до
 * трёх попыток. Как и у записи, в фоне страница грузить не может: файл
 * дольётся, когда человек вернётся.
 */
export async function uploadAuthorFile(
  file: File,
  onProgress?: (fraction: number) => void,
  /** `onWaiting(true)` — ждём возвращения в приложение; `false` — дождались. */
  options: { onWaiting?: (waiting: boolean) => void } = {},
): Promise<BlogAuthorFileDto> {
  const request: CreateBlogAuthorFileUploadRequest = {
    fileName: file.name,
    sizeBytes: file.size,
  };
  // Экран не гаснет на время заливки: погасший экран тоже приостанавливает
  // страницу. Где не поддерживается — молча без этого.
  const release = keepScreenAwake(navigator, document);
  try {
    const create = () =>
      post<BlogAuthorFileUploadResponse>(
        "/blog/authors/me/files/upload",
        request,
      );
    let upload = await create();
    // Частичный PUT в бакет не докачать, поэтому каждая попытка — с нуля;
    // подпись к тому же могла истечь, и перед повтором берём новую.
    for (let attempt = 1; ; attempt += 1) {
      try {
        await putWithProgress(upload, file, onProgress);
        break;
      } catch (cause) {
        if (!(cause instanceof UploadNetworkError)) throw cause;
        const delay = backoffDelay(attempt);
        if (delay === null) throw new AuthorFileError("upload_interrupted");
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
        upload = await create();
      }
    }
    const complete: CompleteBlogAuthorFileUploadRequest = {
      key: upload.key,
      fileName: file.name,
    };
    return await post<BlogAuthorFileDto>("/blog/authors/me/files", complete);
  } finally {
    release();
  }
}

/** Убрать свой файл. */
export async function deleteAuthorFile(fileId: string): Promise<void> {
  const res = await apiFetch(
    `${API_URL}/blog/authors/me/files/${encodeURIComponent(fileId)}`,
    { method: "DELETE", credentials: "include" },
  );
  if (!res.ok) throw new AuthorFileError(await failureCode(res));
}

function putWithProgress(
  upload: BlogAuthorFileUploadResponse,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload.url);
    // Заголовки — ровно из ответа сервера: они вошли в подпись.
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
        : reject(new AuthorFileError("storage_rejected"));
    // Обрыв, отмена и таймаут — сеть или приостановленная страница, а не
    // ответ хранилища: такие ошибки вызывающий может повторить (VED-684).
    xhr.onerror = () => reject(new UploadNetworkError());
    xhr.onabort = () => reject(new UploadNetworkError());
    xhr.ontimeout = () => reject(new UploadNetworkError());
    xhr.send(file);
  });
}
