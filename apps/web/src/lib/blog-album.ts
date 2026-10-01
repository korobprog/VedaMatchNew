// Браузерный клиент фотоальбома личной страницы (VED-686, часть 3).
import {
  BLOG_ALBUM_MAX_PHOTOS,
  BLOG_IMAGE_MAX_BYTES,
  BLOG_POST_MAX_IMAGES,
} from "@vedamatch/shared";
import type {
  BlogAlbumPhotoDto,
  BlogAlbumUploadResponse,
} from "@vedamatch/shared";
import { API_URL, apiFetch } from "@/lib/http-client";
import { BlogApiError, blogErrorText } from "@/lib/blog-client-api";
import {
  backoffDelay,
  isPageReady,
  keepScreenAwake,
  waitUntilVisibleAndOnline,
} from "@/lib/music-upload-retry";

export { BlogApiError };

export interface AlbumRejection {
  name: string;
  reason: string;
}

export interface AlbumPreflight {
  accepted: File[];
  rejected: AlbumRejection[];
}

/** Режет список на куски не длиннее size (size < 1 считается за 1). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += step) {
    out.push(items.slice(i, i + step));
  }
  return out;
}

/**
 * Проверка до отправки: только картинки, не тяжелее предела, и не больше, чем
 * помещается в альбом. Лишние сверх вместимости отказ «album_full».
 */
export function albumPreflight(
  files: readonly File[],
  currentCount: number,
): AlbumPreflight {
  const accepted: File[] = [];
  const rejected: AlbumRejection[] = [];
  let room = Math.max(0, BLOG_ALBUM_MAX_PHOTOS - currentCount);
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      rejected.push({ name: file.name, reason: "not_image" });
    } else if (file.size > BLOG_IMAGE_MAX_BYTES) {
      rejected.push({ name: file.name, reason: "file_too_large" });
    } else if (room <= 0) {
      rejected.push({ name: file.name, reason: "album_full" });
    } else {
      accepted.push(file);
      room -= 1;
    }
  }
  return { accepted, rejected };
}

const MESSAGES: Record<string, string> = {
  caption_invalid: "Подпись не подходит — уберите лишние символы.",
  caption_too_long: "Подпись слишком длинная.",
  photo_not_found: "Фото не найдено — возможно, его уже удалили.",
  no_files: "Выберите хотя бы одну фотографию.",
  image_upload_unavailable: "Загрузка фотографий сейчас недоступна.",
  album_full: `В альбоме уже ${BLOG_ALBUM_MAX_PHOTOS} фото — больше не помещается.`,
  not_image: "Это не фотография.",
  album_photo_only: "В альбом — только фотографии; ролик добавьте в «Файлы».",
  network: "Нет связи. Попробуйте ещё раз.",
};

export function albumErrorText(code: string): string {
  return MESSAGES[code] ?? blogErrorText(code);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(`${API_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  if (!res.ok) {
    const code = await res
      .json()
      .then((body: { message?: string | string[] }) =>
        Array.isArray(body.message) ? body.message[0] : body.message,
      )
      .catch(() => undefined);
    throw new BlogApiError(
      albumErrorText(code ?? ""),
      code ?? "unknown",
      res.status,
    );
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Заливает фото пачками по BLOG_POST_MAX_IMAGES. Сбой пачки не рвёт остальные:
 * её файлы попадают в `failed`. Новые фото идут первыми, как в альбоме.
 *
 * Обрыв при свёрнутом приложении — не окончательная ошибка (VED-684): пачка
 * ждёт возвращения в приложение и связи и уходит заново — до трёх попыток.
 */
export async function uploadAlbumPhotos(
  files: File[],
  /** `onWaiting(true)` — ждём возвращения в приложение; `false` — дождались. */
  options: { onWaiting?: (waiting: boolean) => void } = {},
): Promise<BlogAlbumUploadResponse> {
  let photos: BlogAlbumPhotoDto[] = [];
  const failed: BlogAlbumUploadResponse["failed"] = [];
  // Экран не гаснет на время заливки: погасший экран тоже приостанавливает
  // страницу. Где не поддерживается — молча без этого.
  const release = keepScreenAwake(navigator, document);
  try {
    for (const part of chunk(files, BLOG_POST_MAX_IMAGES)) {
      try {
        const res = await uploadBatch(part, options);
        photos = [...res.photos, ...photos];
        failed.push(...res.failed);
      } catch (cause) {
        const reason = cause instanceof BlogApiError ? cause.code : "network";
        for (const file of part) failed.push({ name: file.name, reason });
      }
    }
  } finally {
    release();
  }
  return { photos, failed };
}

/**
 * Одна пачка с повторами при обрыве. Отказ сервера не повторяем: тот же
 * файл получит тот же ответ, а время на него тратить не стоит.
 */
async function uploadBatch(
  part: File[],
  options: { onWaiting?: (waiting: boolean) => void },
): Promise<BlogAlbumUploadResponse> {
  const form = new FormData();
  for (const file of part) form.append("files", file);
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await request<BlogAlbumUploadResponse>(
        "/blog/authors/me/photos",
        { method: "POST", body: form },
      );
    } catch (cause) {
      const delay =
        cause instanceof BlogApiError ? null : backoffDelay(attempt);
      if (delay === null) throw cause;
      if (!isPageReady(document, navigator)) {
        options.onWaiting?.(true);
        try {
          await waitUntilVisibleAndOnline(document, navigator, window);
        } finally {
          options.onWaiting?.(false);
        }
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

export function updateAlbumCaption(
  id: string,
  caption: string,
): Promise<BlogAlbumPhotoDto> {
  return request<BlogAlbumPhotoDto>(
    `/blog/authors/me/photos/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caption }),
    },
  );
}

export function deleteAlbumPhoto(id: string): Promise<void> {
  return request<void>(`/blog/authors/me/photos/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
