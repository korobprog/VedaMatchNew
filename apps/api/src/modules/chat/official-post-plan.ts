/**
 * Правила очереди постов официального канала. Чистый модуль: что делать с
 * пришедшим событием и с постом, чья очередь настала, решается здесь, а
 * слушатель и воркер только исполняют решение.
 */

export type OfficialPostStatus =
  'pending' | 'posting' | 'posted' | 'cancelled' | 'skipped' | 'failed';

/** Столько попыток публикации, потом пост помечается `failed`. */
export const OFFICIAL_POST_MAX_ATTEMPTS = 3;

/** Строка очереди в том виде, в каком её читают правила. */
export type OfficialPostRow = {
  status: string;
  messageId: string | null;
};

/** Новость из события «опубликована». */
export type PublishedNews = {
  firstPublication: boolean;
  publishAt: Date | null;
  expiresAt: Date | null;
};

export type PublishedPlan =
  /** Завести пост и опубликовать в `publishAt`. */
  | { kind: 'create'; publishAt: Date }
  /** Пост ещё не вышел: обновить текст, картинки и время. */
  | { kind: 'reschedule'; publishAt: Date }
  /** Пост уже в канале: поправить текст сообщения. */
  | { kind: 'edit' }
  /** Нечего делать. */
  | { kind: 'ignore'; reason: string };

/**
 * Что делать с событием «новость опубликована».
 *
 * - Пост заводится только по первой публикации. Правка новости, которой в
 *   канале нет (вышла до появления канала или срок показа кончился раньше
 *   поста), свежей новостью не становится.
 * - Видимость: новость, чей срок показа уже кончился, в общий канал не идёт.
 *   Отложенная уходит в назначенное время, не раньше — до него её не видит
 *   никто.
 * - Пост в канале правится вместе с новостью: чаще всего это опечатка, и
 *   второй пост о том же — шум. Картинки у вышедшего поста не меняются:
 *   сообщение чата правит только текст.
 * - Снятую и опубликованную снова новость пост догоняет заново: прежнее
 *   сообщение при снятии удалено.
 */
export function planPublished(
  existing: OfficialPostRow | null,
  news: PublishedNews,
  now: Date,
): PublishedPlan {
  if (news.expiresAt && news.expiresAt.getTime() <= now.getTime())
    return existing?.status === 'posted' && existing.messageId
      ? { kind: 'edit' }
      : { kind: 'ignore', reason: 'срок показа кончился' };

  const publishAt =
    news.publishAt && news.publishAt.getTime() > now.getTime()
      ? news.publishAt
      : now;

  if (!existing)
    return news.firstPublication
      ? { kind: 'create', publishAt }
      : { kind: 'ignore', reason: 'правка новости, которой нет в канале' };

  switch (existing.status) {
    case 'pending':
    case 'failed':
    case 'skipped':
      return { kind: 'reschedule', publishAt };
    case 'posting':
      // Воркер уже публикует: текст догонит следующая правка, а менять
      // строку под ним — гонка за то, что уйдёт в канал.
      return { kind: 'ignore', reason: 'пост публикуется прямо сейчас' };
    case 'posted':
      return existing.messageId
        ? { kind: 'edit' }
        : { kind: 'ignore', reason: 'сообщение поста удалено' };
    case 'cancelled':
      return news.firstPublication
        ? { kind: 'reschedule', publishAt }
        : { kind: 'ignore', reason: 'пост снят' };
    default:
      return {
        kind: 'ignore',
        reason: `неизвестный статус ${existing.status}`,
      };
  }
}

export type WithdrawnPlan =
  | { kind: 'cancel' }
  | { kind: 'delete-message'; messageId: string }
  | { kind: 'ignore' };

/**
 * Новость сняли (удалили или вернули в черновик): её больше не видит никто.
 * Невышедший пост отменяется, вышедшее сообщение удаляется — иначе ссылка
 * «подробнее» вела бы на новость, которой нет.
 */
export function planWithdrawn(existing: OfficialPostRow | null): WithdrawnPlan {
  if (!existing) return { kind: 'ignore' };
  if (existing.status === 'posted')
    return existing.messageId
      ? { kind: 'delete-message', messageId: existing.messageId }
      : { kind: 'cancel' };
  if (existing.status === 'cancelled') return { kind: 'ignore' };
  return { kind: 'cancel' };
}

/**
 * Пост, чья очередь настала: публиковать или пропустить. Срок показа мог
 * кончиться, пока пост ждал (упавший воркер, отложенная новость с коротким
 * сроком), — такую новость люди уже не найдут по ссылке.
 */
export function dueAction(
  post: { expiresAt: Date | null },
  now: Date,
): 'post' | 'skip' {
  if (post.expiresAt && post.expiresAt.getTime() <= now.getTime())
    return 'skip';
  return 'post';
}

/**
 * Кто пишет пост. Администратор, опубликовавший новость, — если он
 * администратор канала; иначе первый по времени вступления. Никого — `null`:
 * писать некому, пост подождёт.
 */
export function pickChannelAuthor(
  admins: readonly string[],
  preferred: string | null | undefined,
): string | null {
  if (preferred && admins.includes(preferred)) return preferred;
  return admins[0] ?? null;
}

/** Картинки из JSON-колонки: всё непохожее на картинку отбрасывается. */
export function parsePostImages(
  raw: unknown,
): { url: string; width: number; height: number }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const { url, width, height } = item as Record<string, unknown>;
    if (typeof url !== 'string' || !url) return [];
    return [
      {
        url,
        width: typeof width === 'number' && width > 0 ? width : 0,
        height: typeof height === 'number' && height > 0 ? height : 0,
      },
    ];
  });
}
