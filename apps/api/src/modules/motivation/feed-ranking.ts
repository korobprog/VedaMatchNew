import { createHash } from 'node:crypto';
import type { MotivationFeedTier } from '@vedamatch/shared';

/**
 * Минимум, который нужен ранжированию от поста. Держим узким, чтобы тест
 * собирал посты из пары полей, а сервис мог передать что угодно сверху.
 */
export interface RankablePost {
  id: string;
  category: string;
  publishedAt: Date | null;
  /** Когда этот человек впервые посмотрел пост; пусто — не смотрел. */
  viewedAt: Date | null;
}

export interface RankingSession {
  userId: string;
  /**
   * Момент начала листания. Ярусы считаются по состоянию на него: просмотры,
   * сделанные уже во время листания, порядок не меняют — иначе вторая
   * страница уехала бы относительно первой и слайды пропадали бы.
   */
  since: Date;
  /**
   * Прошлый визит в ленту. Опубликованное после него и ещё не просмотренное
   * — ярус «свежее». Пусто — новичок, для него всё архив.
   */
  seenBefore: Date | null;
}

export interface RankedPost<T> {
  post: T;
  tier: MotivationFeedTier;
}

/** Сколько подряд постов одной категории допускает ярус архива. */
export const MAX_SAME_CATEGORY_RUN = 2;

/**
 * Раскладывает посты одного трека по ярусам и упорядочивает внутри каждого.
 *
 * «Свежее» — новые сверху: человек пришёл за постом дня. «Непросмотренное» —
 * перемешано семенем от пары (пользователь, пост): у каждого своя, но
 * постоянная последовательность, два новичка не листают одно и то же подряд,
 * а курсор по позициям остаётся верным между страницами. «Повтор» — сначала
 * давно виденное, чтобы повтор не оказался вчерашним.
 */
export function rankFeed<T extends RankablePost>(
  posts: readonly T[],
  session: RankingSession,
): RankedPost<T>[] {
  const fresh: T[] = [],
    unseen: T[] = [],
    seen: T[] = [];
  for (const post of posts) {
    const viewed =
      post.viewedAt !== null &&
      post.viewedAt.getTime() < session.since.getTime();
    if (viewed) seen.push(post);
    else if (
      session.seenBefore &&
      post.publishedAt &&
      post.publishedAt.getTime() > session.seenBefore.getTime()
    )
      fresh.push(post);
    else unseen.push(post);
  }

  fresh.sort(
    (a, b) =>
      (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );
  const seeded = unseen
    .map((post) => ({ post, seed: seedOf(session.userId, post.id) }))
    .sort(
      (a, b) =>
        a.seed.localeCompare(b.seed) || a.post.id.localeCompare(b.post.id),
    )
    .map((item) => item.post);
  seen.sort(
    (a, b) =>
      (a.viewedAt?.getTime() ?? 0) - (b.viewedAt?.getTime() ?? 0) ||
      a.id.localeCompare(b.id),
  );

  return [
    ...fresh.map((post) => ({ post, tier: 'fresh' as const })),
    ...spreadCategories(seeded, MAX_SAME_CATEGORY_RUN).map((post) => ({
      post,
      tier: 'unseen' as const,
    })),
    ...seen.map((post) => ({ post, tier: 'seen' as const })),
  ];
}

/**
 * Стабильное семя перемешивания. Хеш, а не Math.random: порядок обязан
 * совпадать между запросами страниц и между репликами API.
 */
export function seedOf(userId: string, postId: string): string {
  return createHash('sha1').update(`${userId}:${postId}`).digest('hex');
}

/**
 * Не даёт одной категории идти подряд дольше `maxRun`: при превышении
 * ближайший пост другой категории поднимается на это место. Детерминировано
 * — при одинаковом входе одинаковый выход, поэтому курсор не ломается.
 * Если других категорий не осталось, хвост остаётся как есть.
 */
export function spreadCategories<T extends { category: string }>(
  posts: readonly T[],
  maxRun: number,
): T[] {
  const result = [...posts];
  for (let i = maxRun; i < result.length; i++) {
    const run = result
      .slice(i - maxRun, i)
      .every((post) => post.category === result[i].category);
    if (!run) continue;
    const swap = result.findIndex(
      (post, index) => index > i && post.category !== result[i].category,
    );
    if (swap === -1) break;
    const [moved] = result.splice(swap, 1);
    result.splice(i, 0, moved);
  }
  return result;
}
