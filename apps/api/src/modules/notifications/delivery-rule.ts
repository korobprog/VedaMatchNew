import type {
  NotificationCategory,
  NotificationPreferencesDto,
} from '@vedamatch/shared';

/**
 * Кому и что слать — одно правило в одном месте (VED-361).
 *
 * Раньше это была строка условия внутри `deliver()`: `!preferences.enabled ||
 * !preferences[content.category]`. Пока категорий было двенадцать и каждая
 * значила «новости такого-то сервиса», строки хватало. Со звонками цена
 * ошибки выросла: пропущенный анонс — досада, пропущенный входящий — потеря,
 * и проверять правило надо отдельно от сервисов, транспортов и базы.
 *
 * Отсюда и отдельный модуль: ни Prisma, ни Nest, ни сети — вход целиком в
 * аргументах, выход разбирается тестом по всем сочетаниям выключателей
 * (`delivery-rule.spec.ts`).
 *
 * Главное, что правило закрепляет: категории независимы. «Сообщения»
 * выключены, «Звонки» включены — звонок идёт. Наоборот — идёт сообщение.
 * Общий выключатель `enabled` гасит всё: это осознанное «не беспокоить»
 * поверх любых категорий.
 */

export type DeliveryDecision =
  /** Слать: колокольчик, браузер, телефон, бот. */
  | { deliver: true }
  /** Не слать; `reason` идёт в лог — молчание без причины не отладить. */
  | { deliver: false; reason: 'all-off' | 'category-off' };

export function decideDelivery(
  preferences: NotificationPreferencesDto,
  category: NotificationCategory,
): DeliveryDecision {
  if (!preferences.enabled) return { deliver: false, reason: 'all-off' };
  // Категория без своего поля в настройках дала бы `undefined` — то есть
  // молчание вместо уведомления. Так однажды вышло с «Музыкой»; тип
  // `NotificationPreferencesDto extends Record<NotificationCategory, boolean>`
  // теперь не даст собраться такой категории, а здесь остаётся честный
  // булев разбор.
  if (!preferences[category]) return { deliver: false, reason: 'category-off' };
  return { deliver: true };
}

/** Строка для лога: почему уведомление не ушло. */
export function describeDeliverySkip(
  reason: 'all-off' | 'category-off',
  category: NotificationCategory,
): string {
  return reason === 'all-off'
    ? 'все уведомления выключены'
    : `категория ${category} выключена`;
}
