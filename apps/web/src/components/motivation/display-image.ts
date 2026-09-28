/**
 * Какой файл иллюстрации показывать на слайде (VED-629).
 *
 * У поста два файла: оригинал (`imageUrl`, сгенерированный PNG 1024×1536 —
 * мегабайты) и лёгкая копия WebP шириной 720 (`imageThumbUrl`). Копию
 * показывает только викторина, а пока её нет — старые посты доделывает
 * бэкфилл — оригинал. Лента, плитки категорий, «Мои», «Поделиться» и
 * «Скачать» — всегда оригинал: во Вдохновении просили качество, лёгкие
 * картинки — только для викторины.
 */
export interface DisplayImageSource {
  imageUrl: string;
  /** Пустая строка или отсутствие — копии ещё нет. */
  imageThumbUrl?: string | null;
}

export function displayImageUrl(post: DisplayImageSource): string {
  return post.imageThumbUrl?.trim() || post.imageUrl;
}
