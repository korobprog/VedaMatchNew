import type { BlogImageDto, BlogPostDto, BlogRepostSourceDto } from '@vedamatch/shared';
import { plural } from '@/lib/chat/plural';
import { blogEditedLabel, blogPostDate } from './blog-format';

/**
 * Состояние блог-ленты в приложении (VED-334) — чистая часть экранов.
 *
 * Лента приходит порциями по курсору (`GET /blog/feed`, 12 постов), свежее
 * сверху, закреплённое администратором — выше всего. Порядок задаёт сервер
 * (`blog-feed-query.ts`), и клиент его не пересобирает: пересортировка по
 * дате здесь молча опустила бы закреплённый пост под свежие.
 */

/**
 * Дописать следующую порцию в конец. Пост, который уже есть в ленте, второй
 * раз не добавляется: свой только что опубликованный пост стоит сверху, а
 * через порцию он же приезжает с сервера — без сверки он стоял бы дважды,
 * и у двух строк списка был бы один ключ.
 */
export function mergeBlogPages(current: readonly BlogPostDto[], next: readonly BlogPostDto[]): BlogPostDto[] {
  const seen = new Set(current.map((post) => post.id));
  const merged = [...current];
  for (const post of next) {
    if (seen.has(post.id)) continue;
    seen.add(post.id);
    merged.push(post);
  }
  return merged;
}

/**
 * Только что опубликованный пост — наверх, но под закреплёнными: сервер
 * поставит его ровно туда же при следующей загрузке, и экран не должен
 * прыгать при обновлении.
 */
export function prependBlogPost(current: readonly BlogPostDto[], post: BlogPostDto): BlogPostDto[] {
  const rest = current.filter((item) => item.id !== post.id);
  if (post.pinned) return [post, ...rest];
  const firstUnpinned = rest.findIndex((item) => !item.pinned);
  const at = firstUnpinned < 0 ? rest.length : firstUnpinned;
  return [...rest.slice(0, at), post, ...rest.slice(at)];
}

export function replaceBlogPost(current: readonly BlogPostDto[], post: BlogPostDto): BlogPostDto[] {
  return current.map((item) => (item.id === post.id ? post : item));
}

/**
 * Убрать пост из ленты. Только его самого: чужие репосты удалённого поста
 * сервер не удаляет (`repostOf` с `onDelete: SetNull`), они остаются
 * постами своих авторов — убрать их с экрана значило бы показать ленту,
 * которой на сервере нет.
 */
export function removeBlogPost(current: readonly BlogPostDto[], id: string): BlogPostDto[] {
  return current.filter((item) => item.id !== id);
}

/** Репост засчитан: счётчик растёт у оригинала — где бы он ни стоял в ленте. */
export function countRepost(current: readonly BlogPostDto[], sourceId: string): BlogPostDto[] {
  return current.map((item) => (item.id === sourceId ? { ...item, repostCount: item.repostCount + 1 } : item));
}

/**
 * Что показывать крупно: у репоста своих картинок и заголовка обычно нет —
 * показываем оригинал, иначе в плитке висит серый квадрат вместо того, что
 * человек переслал (то же решение, что у виджета главной на сайте).
 */
export function shownContent(post: BlogPostDto): BlogPostDto | BlogRepostSourceDto {
  return post.repostOf ?? post;
}

/** Подпись плитки: заголовок, а без него — начало текста. */
export function blogTileTitle(post: BlogPostDto): string {
  const shown = shownContent(post);
  if (shown.title) return shown.title;
  const text = shown.text.replace(/\s+/g, ' ').trim();
  if (!text) return 'Фотография';
  return text.length > 60 ? `${text.slice(0, 59).trimEnd()}…` : text;
}

/**
 * Тихая строка под заголовком карточки: автор, дата, отметки.
 *
 * Имя — `author.name` из ответа сервера, и только оно: сервер уже собрал его
 * через `resolveDisplayName()` (духовное имя, если заполнено), а у клиента
 * мирского имени нет вовсе. Строка одна, без шапки с аватаром: заказчик
 * просил не отдавать шапке место над картинкой (VED-238, чек-лист), шапка с
 * аватаром — в полном развороте поста.
 */
export function blogMetaLine(post: BlogPostDto, now: Date = new Date()): string {
  return [post.author.name, blogDateLine(post, now)].filter((part) => part !== '').join(' · ');
}

/** Та же строка без имени — под именем в шапке полного разворота. */
export function blogDateLine(post: BlogPostDto, now: Date = new Date()): string {
  const parts = [blogPostDate(post.createdAt, now)];
  const edited = blogEditedLabel(post.editedAt, post.createdAt);
  if (edited) parts.push(edited);
  if (post.pinned) parts.push('закреплено');
  if (!post.inFeed) parts.push('вне ленты');
  return parts.filter((part) => part !== '').join(' · ');
}

/**
 * Строка над репостом. Крупно показан оригинал (`shownContent`), поэтому
 * имя того, кто поделился, обязано стоять над ним — иначе чужой пост
 * выглядит как пост автора оригинала, опубликованный второй раз. `null` —
 * это не репост.
 */
export function blogRepostLabel(post: BlogPostDto): string | null {
  if (!post.repostOf) return null;
  return `Репост · ${post.author.name}`;
}

/** Тихая строка под заголовком репоста — автор и дата оригинала. */
export function blogSourceMetaLine(post: BlogPostDto, now: Date = new Date()): string {
  const shown = shownContent(post);
  return [shown.author.name, blogPostDate(shown.createdAt, now)].filter((part) => part !== '').join(' · ');
}

/**
 * Подпись к «Вся лента» под плитками: сколько ещё свежих постов не
 * поместилось. Без остатка — «и прошлые посты», как на сайте: полоса
 * показывает только текущую ленту, а архив лежит за этой строкой всегда.
 */
export function blogRestLabel(total: number, shown: number): string {
  const rest = Math.max(0, total - shown);
  if (rest === 0) return 'Вся лента и прошлые посты';
  return `Вся лента · ещё ${rest} ${plural(rest, 'пост', 'поста', 'постов')}`;
}

/** «12 постов» под именем в блоге автора. */
export function blogAuthorCount(total: number): string {
  if (total <= 0) return 'Постов пока нет';
  return `${total} ${plural(total, 'пост', 'поста', 'постов')}`;
}

/** Самая вытянутая картинка, которую показываем целиком: 4:5, как у Instagram. */
export const BLOG_IMAGE_MIN_ASPECT = 0.8;
/** Самая широкая: панорама шире 2:1 превратилась бы в полоску. */
export const BLOG_IMAGE_MAX_ASPECT = 2;

/**
 * Пропорция рамки под картинки поста (ширина / высота).
 *
 * Заказчик: «картинку было видно полностью и она растянута на всю длину
 * экрана» (VED-238, чек-лист). Значит рамка — во всю ширину, а высота — по
 * самой картинке, без обрезки. Без размеров (старые посты) — квадрат.
 * В карусели рамка одна на все кадры — по первому, иначе карточка прыгала
 * бы по высоте при листании.
 */
export function blogImageAspect(images: readonly Pick<BlogImageDto, 'width' | 'height'>[]): number {
  const first = images[0];
  if (!first || !first.width || !first.height || first.width <= 0 || first.height <= 0) return 1;
  const ratio = first.width / first.height;
  return Math.min(BLOG_IMAGE_MAX_ASPECT, Math.max(BLOG_IMAGE_MIN_ASPECT, ratio));
}

/** «2 из 5» над каруселью; для одной картинки подписи нет. */
export function blogImageCounter(index: number, count: number): string | null {
  if (count <= 1) return null;
  const clamped = Math.min(count, Math.max(1, index + 1));
  return `${clamped} из ${count}`;
}

/** Номер кадра карусели по сдвигу прокрутки. */
export function blogImageIndex(offsetX: number, frameWidth: number, count: number): number {
  if (frameWidth <= 0 || count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(offsetX / frameWidth)));
}
