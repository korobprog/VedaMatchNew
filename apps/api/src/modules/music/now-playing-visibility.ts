/**
 * Кто видит, что человек слушает сейчас.
 *
 * Чистой функцией и под тестом, потому что здесь пять независимых условий и
 * ошибка в любом означает, что человек «светится» там, где не хотел. Лекции
 * и мантры на ночь — не то, о чём хочется отчитываться, и цена ошибки тут не
 * «неудобно», а «выдали лишнее о человеке».
 *
 * Все четыре первых условия — запрещающие и проверяются независимо: снятие
 * одного не должно молча открывать то, что закрыто другим. Это проверяется
 * отдельным тестом.
 */
export interface NowPlayingVisibilityInput {
  /** Настройка человека: `friends` по умолчанию. */
  visibility: 'friends' | 'nobody';
  /** Кнопка «невидимый сеанс» в плеере, на один сеанс. */
  isPrivateSession: boolean;
  /** Открыта ли зрителю активность: мэтч в Знакомствах, раскрытые контакты. */
  viewerIsFriend: boolean;
  /** Блокировка в любую сторону — через ModerationModule, как у всех. */
  viewerBlocked: boolean;
  /** Строка старше `durationSeconds + 2 мин` без heartbeat. */
  stale: boolean;
}

export function isNowPlayingVisible(input: NowPlayingVisibilityInput): boolean {
  if (input.isPrivateSession) return false;
  if (input.visibility === 'nobody') return false;
  if (input.viewerBlocked) return false;
  if (input.stale) return false;
  return input.viewerIsFriend;
}

/**
 * Запас поверх длительности. Heartbeat приходит раз в 30 секунд, но вкладку
 * могли усыпить, а канал — моргнуть; две минуты переживают и то, и другое.
 * Без запаса человек «переставал слушать» на каждой поездке в метро.
 */
const STALE_GRACE_MS = 2 * 60 * 1000;

/**
 * Протухла ли строка «слушает сейчас». Иначе человек «слушает» третьи сутки:
 * вкладку закрыли, а heartbeat, который снял бы строку, уже не придёт.
 */
export function isNowPlayingStale(
  row: { updatedAt: Date; durationSeconds: number },
  now: Date,
): boolean {
  const limit = Math.max(0, row.durationSeconds) * 1000 + STALE_GRACE_MS;
  return now.getTime() - row.updatedAt.getTime() > limit;
}
