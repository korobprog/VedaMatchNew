import {
  BLOG_DEFAULT_FEED_LIFETIME_HOURS,
  BLOG_MAX_FEED_LIFETIME_HOURS,
  BLOG_MIN_FEED_LIFETIME_HOURS,
} from '@vedamatch/shared';

/**
 * Срок нахождения поста в ленте (VED-238).
 *
 * Чистый модуль: срок — единственное, чем в этом сервисе управляет
 * администратор, и вся его арифметика должна проверяться тестом, а не
 * читаться глазами внутри сервиса.
 *
 * Договорённость про ноль: `0` часов — это «без срока», а не «исчезнуть
 * немедленно». Так администратору не нужно отдельное поле-флажок, а форма
 * остаётся одним числом.
 */

/**
 * Привести присланное число к допустимому сроку.
 *
 * Мусор (строка, NaN, дробь, отрицательное) — не ошибка формы, а повод
 * взять значение по умолчанию: срок не то поле, ради которого стоит ронять
 * публикацию поста. Явный `0` проходит как «без срока».
 */
export function clampFeedLifetimeHours(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return BLOG_DEFAULT_FEED_LIFETIME_HOURS;
  }
  const whole = Math.trunc(value);
  if (whole <= 0) return 0;
  if (whole < BLOG_MIN_FEED_LIFETIME_HOURS) return BLOG_MIN_FEED_LIFETIME_HOURS;
  if (whole > BLOG_MAX_FEED_LIFETIME_HOURS) return BLOG_MAX_FEED_LIFETIME_HOURS;
  return whole;
}

/**
 * До какого момента пост держится в ленте. `null` — бессрочно.
 *
 * Считается один раз, в момент публикации, и дальше живёт колонкой: смена
 * срока по умолчанию не имеет права задним числом выкинуть из ленты то, что
 * уже опубликовано.
 */
export function feedUntilFrom(now: Date, hours: number): Date | null {
  const lifetime = clampFeedLifetimeHours(hours);
  if (lifetime === 0) return null;
  return new Date(now.getTime() + lifetime * 60 * 60 * 1000);
}

/**
 * Показывается ли пост в текущей ленте.
 *
 * Граница исключающая: пост со сроком ровно «сейчас» уже вышел из ленты.
 * Иначе один и тот же момент времени давал бы разный ответ у виджета и у
 * запроса к базе, где условие `feedUntil > now`.
 */
export function isInFeed(feedUntil: Date | null, now: Date): boolean {
  if (feedUntil === null) return true;
  return feedUntil.getTime() > now.getTime();
}

/**
 * Сколько часов осталось посту в ленте, округляя вверх. `null` — бессрочно,
 * `0` — уже вышел. Нужен подписи «в ленте ещё N ч» в карточке.
 */
export function hoursLeftInFeed(
  feedUntil: Date | null,
  now: Date,
): number | null {
  if (feedUntil === null) return null;
  const ms = feedUntil.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (60 * 60 * 1000));
}
