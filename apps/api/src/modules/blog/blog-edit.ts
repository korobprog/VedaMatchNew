/**
 * Правка поста блог-ленты (VED-321) — чистая часть.
 *
 * Решение «кому можно» и «что станет с картинками» вынесено из сервиса
 * отдельным модулем: права проверяются на сервере, а не прятанием кнопки,
 * и такую проверку положено покрывать тестом, а не читать глазами внутри
 * метода, где рядом Prisma и S3.
 */

/** Кто правит: сам автор или администратор сервиса. */
export interface BlogEditViewer {
  userId: string;
  isAdmin: boolean;
}

/** То немногое из поста, что нужно для решения о праве на правку. */
export interface BlogEditablePost {
  authorId: string;
  /** Не null — это репост: своя карточка, но чужие слова внутри. */
  repostOfId: string | null;
}

export type BlogEditDenial = 'not_your_post' | 'repost_not_editable';

/**
 * `null` — правка разрешена.
 *
 * Репост не правится никем, включая автора репоста и администратора:
 * вложенная карточка — не снимок, а живой оригинал, и «поправить репост»
 * означало бы либо переписать чужой пост, либо развести его с оригиналом.
 * Правит автор оригинала — и правка сама доезжает до всех репостов.
 * Свои слова к репосту переписать нельзя тем же ответом: карточка репоста
 * целиком принадлежит оригиналу, а лишнее исключение здесь пришлось бы
 * объяснять человеку прямо в ленте.
 */
export function blogEditDenial(
  post: BlogEditablePost,
  viewer: BlogEditViewer,
): BlogEditDenial | null {
  if (post.repostOfId !== null) return 'repost_not_editable';
  if (post.authorId !== viewer.userId && !viewer.isAdmin) {
    return 'not_your_post';
  }
  return null;
}

/**
 * Какие картинки участник оставил. Форма шлёт id оставленных, а не
 * удалённых: список удалённых расходится с экраном, когда пост успели
 * поправить из другой вкладки, и тогда «убрал одну» стирает все.
 *
 * `null` — поля в запросе не было вовсе: правка картинок не касается, и
 * они остаются как есть. Пустой список — «убрал все», и это разные вещи:
 * PATCH с одним текстом не имеет права унести фотографии молча.
 *
 * Приезжает из multipart, где значение поля — строка или массив строк, а из
 * JSON — обычный массив. Чужие id молча отбрасываются: это не ошибка формы,
 * а гонка с чужой правкой или подбор.
 */
export function parseKeepImageIds(value: unknown): string[] | null {
  if (value === undefined || value === null) return null;
  const raw = Array.isArray(value) ? value : [value];
  const ids: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    for (const part of item.split(',')) {
      const id = part.trim();
      if (id !== '' && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export interface BlogStoredImage {
  id: string;
  storageKey: string;
}

export interface BlogImagePlan<T extends BlogStoredImage> {
  /** Остаются в посте, в порядке, который задал участник. */
  kept: T[];
  /** Уходят из базы, а следом из бакета. */
  removed: T[];
  /** С какой позиции продолжать нумерацию новых файлов. */
  nextPosition: number;
}

/**
 * Что делать с уже загруженными картинками. Порядок берём из списка
 * оставленных: перестановка на экране должна доезжать до ленты, а
 * позиция — это поле, а не имя объекта в бакете.
 *
 * `keepIds === null` — про картинки в запросе не было ни слова, значит они
 * остаются все и в прежнем порядке.
 */
export function planBlogImages<T extends BlogStoredImage>(
  existing: T[],
  keepIds: string[] | null,
): BlogImagePlan<T> {
  if (keepIds === null) {
    return { kept: [...existing], removed: [], nextPosition: existing.length };
  }
  const byId = new Map(existing.map((image) => [image.id, image]));
  const kept: T[] = [];
  for (const id of keepIds) {
    const image = byId.get(id);
    if (image) kept.push(image);
  }
  const keptIds = new Set(kept.map((image) => image.id));
  const removed = existing.filter((image) => !keptIds.has(image.id));
  return { kept, removed, nextPosition: kept.length };
}
