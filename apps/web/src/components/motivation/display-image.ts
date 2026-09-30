/**
 * Какой файл иллюстрации показывать (VED-629).
 *
 * У поста три файла:
 * - `imageUrl` — оригинал, сгенерированный PNG 1024×1536, мегабайты. Только
 *   для «Скачать», «Поделиться» и сборки сторис;
 * - `imageWebUrl` — тот же кадр в WebP полного размера: качество оригинала,
 *   вес в разы меньше. Им лента и страница поста показывают кадр;
 * - `imageThumbUrl` — WebP шириной 720: викторина, мелкие плитки и размытая
 *   подложка под кадром ленты, где резкость не видна.
 *
 * Копий может ещё не быть — старые посты доделывает бэкфилл; тогда берётся
 * следующий по качеству файл, в конце — оригинал.
 */
export interface DisplayImageSource {
  imageUrl: string;
  /** Пустая строка или отсутствие — копии ещё нет. */
  imageThumbUrl?: string | null;
  /** Пустая строка или отсутствие — копии ещё нет. */
  imageWebUrl?: string | null;
}

/** Лёгкая копия 720: викторина, плитки, размытая подложка. */
export function displayImageUrl(post: DisplayImageSource): string {
  return (
    post.imageThumbUrl?.trim() || post.imageWebUrl?.trim() || post.imageUrl
  );
}

/** Кадр во весь экран: полноразмерный WebP, без него — оригинал. */
export function feedImageUrl(post: DisplayImageSource): string {
  return post.imageWebUrl?.trim() || post.imageUrl;
}
