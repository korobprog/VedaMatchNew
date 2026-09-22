import { parseTaskStatusMark, type NotificationMark } from '@vedamatch/shared';

/**
 * Пометка состояния у уведомления (VED-272, VED-320).
 *
 * Разбора названия колонки здесь больше нет — он уехал в «Работу»
 * (`work-task-status.ts`), и уведомления получают готовый код в событии. Так
 * вылечена жалоба VED-320: пока состояние считали здесь, а ярлык на карточке —
 * там, два списка синонимов отвечали на один вопрос по-разному, и человек видел
 * в ленте «Тестирование», а в планировщике «На доработку».
 *
 * Своей остаётся ровно одна забота — колонка `NotificationItem.mark` хранит
 * строку, а не энум, и строка из записи, сделанной сборкой с другим набором, не
 * должна утечь клиенту неизвестным кодом.
 */
export function parseNotificationMark(
  value: string | null | undefined,
): NotificationMark | null {
  return parseTaskStatusMark(value);
}
