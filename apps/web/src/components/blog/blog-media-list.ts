import type {
  BlogImageDto,
  BlogMediaDto,
  BlogPostDto,
  BlogRepostSourceDto,
} from "@vedamatch/shared";

/**
 * Вложения поста — чистая часть карусели (VED-238, VED-116).
 *
 * Пропорция рамки, обложка слайда главной и подпись длительности ролика
 * считаются здесь и проверяются тестом; компоненты вокруг только рисуют.
 */

/**
 * Рамка карусели не уже 4:5 и не шире 1,91:1 — те же границы, что у
 * Instagram. Внутри рамки снимок вписывается целиком (`object-contain`):
 * заказчик просил, чтобы картинку «было видно полностью» (VED-238), а
 * обрезка по рамке срезала бы вертикальные снимки с телефона.
 */
export const BLOG_MEDIA_MIN_ASPECT = 4 / 5;
export const BLOG_MEDIA_MAX_ASPECT = 1.91;

/**
 * Вложения в порядке карусели. `media` приходит от сервера с роликами; если
 * его нет (ответ старого API во время выкладки), собираем из фотографий —
 * лента не должна пустеть из-за порядка перезапуска контейнеров.
 */
export function postMedia(
  post: Pick<BlogPostDto, "images"> & { media?: BlogMediaDto[] },
): BlogMediaDto[] {
  if (Array.isArray(post.media)) return post.media;
  return post.images.map((image: BlogImageDto) => ({
    ...image,
    kind: "photo" as const,
    posterUrl: null,
    durationSec: null,
  }));
}

/** Ширина к высоте, зажатая в границы рамки. Неизвестный размер — квадрат. */
export function blogMediaAspect(
  item: Pick<BlogMediaDto, "width" | "height"> | null | undefined,
): number {
  if (!item?.width || !item?.height || item.width <= 0 || item.height <= 0) {
    return 1;
  }
  const ratio = item.width / item.height;
  return Math.min(BLOG_MEDIA_MAX_ASPECT, Math.max(BLOG_MEDIA_MIN_ASPECT, ratio));
}

/** Что показать картинкой вместо самого вложения: у ролика — обложку. */
export function blogMediaPreviewUrl(item: BlogMediaDto): string | null {
  return item.kind === "video" ? item.posterUrl : item.url;
}

/** «0:07», «4:05», «1:02:03». `null` — длительность неизвестна. */
export function formatBlogDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const rest = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

export interface BlogHomeSlide {
  id: string;
  /**
   * Подпись под картинкой. У поста без заголовка, но с картинкой — начало
   * текста; `null` — подписи нет (пост из одних слов: слова уже в рамке).
   */
  title: string | null;
  /** Картинка слайда: фото или обложка ролика; null — пост из одних слов. */
  coverUrl: string | null;
  /** Что написать в рамке, когда картинки нет. */
  frameText: string;
  isVideo: boolean;
  /** Сколько вложений в посте — для отметки на слайде. */
  mediaCount: number;
  aspect: number;
}

const EXCERPT_LENGTH = 140;
const CAPTION_LENGTH = 80;

function clip(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length).trimEnd()}…` : text;
}

/**
 * Слайд виджета главной: «верхняя панель, картинка, заголовок. Всё» (чек-лист
 * VED-238). Автора и даты здесь нет намеренно — они живут в развороте поста.
 *
 * У репоста своих картинок и заголовка обычно нет — показываем оригинал,
 * иначе на главной висит пустая рамка вместо того, что человек переслал.
 *
 * Пост без картинки — слова в рамке, а подпись под ней только если у поста
 * есть и заголовок, и текст: иначе одно и то же стояло бы дважды.
 */
export function blogHomeSlide(post: BlogPostDto): BlogHomeSlide {
  const shown: BlogPostDto | BlogRepostSourceDto = post.repostOf ?? post;
  const media = postMedia(shown);
  const first = media[0] ?? null;
  const text = shown.text.replace(/\s+/g, " ").trim();
  const coverUrl = first ? blogMediaPreviewUrl(first) : null;

  let title: string | null;
  let frameText = "";
  if (coverUrl) {
    title = shown.title ?? (text ? clip(text, CAPTION_LENGTH) : null);
  } else {
    frameText = text ? clip(text, EXCERPT_LENGTH) : (shown.title ?? "");
    title = text && shown.title ? shown.title : null;
  }

  return {
    id: post.id,
    title,
    coverUrl,
    frameText,
    isVideo: first?.kind === "video",
    mediaCount: media.length,
    aspect: blogMediaAspect(first),
  };
}
