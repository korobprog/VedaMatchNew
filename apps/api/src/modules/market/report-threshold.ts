/**
 * Сколько открытых жалоб скрывают объект автоматически.
 *
 * Три — компромисс: одной жалобы мало (ею легко свести счёты с конкурентом),
 * а десяти на небольшой площадке никогда не наберётся, и постмодерация
 * превратится в её отсутствие. Скрытие обратимо: админ возвращает объект
 * из панели.
 */
export const REPORT_HIDE_THRESHOLD = 3;

/**
 * Пересекла ли жалоба порог именно сейчас.
 *
 * Ключевое здесь — «именно сейчас»: проверка `count >= threshold` срабатывала
 * бы на каждой следующей жалобе, и объект скрывался бы снова после того, как
 * админ его вернул. Поэтому сравниваем ровно с порогом.
 */
export function crossesHideThreshold(openReportsCountAfter: number): boolean {
  return openReportsCountAfter === REPORT_HIDE_THRESHOLD;
}

/** Ключ уникальности жалобы: один человек жалуется на объект один раз.
 *  Отдельная колонка нужна потому, что уникальный индекс по колонкам с NULL
 *  в Postgres не дедуплицирует. */
export function reportTargetKey(
  targetKind: 'listing' | 'shop' | 'comment' | 'review',
  targetId: string,
): string {
  return `${targetKind}:${targetId}`;
}
