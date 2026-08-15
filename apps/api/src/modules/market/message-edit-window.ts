/**
 * Сколько времени автор может править отправленное сообщение.
 *
 * В union-чате окна нет вовсе — там сообщение правится когда угодно. Для
 * Рынка это плохо: в переписке договариваются о цене и сроках, и задним числом
 * переписанное «привезу за 2000» превращает договорённость в спор без следов.
 * Пятнадцати минут хватает исправить опечатку, но не переиграть сделку.
 */
export const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

export const MAX_MESSAGE_LENGTH = 2000;

/**
 * Допуск на рассинхрон часов. `createdAt` проставляет Postgres, а `now` берёт
 * приложение — на разных хостах их часы расходятся на секунды, и без допуска
 * только что отправленное сообщение выглядело бы «из будущего» и становилось
 * бы нередактируемым. Минуты хватает на любой разумный дрейф, и она сильно
 * меньше самого окна.
 */
const CLOCK_SKEW_TOLERANCE_MS = 60 * 1000;

export function isWithinEditWindow(createdAt: Date, now: Date): boolean {
  const elapsed = now.getTime() - createdAt.getTime();
  // Дата заметно впереди — это уже не дрейф часов, а подделка: править не даём,
  // иначе окно можно растянуть навсегда.
  if (elapsed < -CLOCK_SKEW_TOLERANCE_MS) return false;
  return elapsed <= MESSAGE_EDIT_WINDOW_MS;
}

export type MessageValidationError =
  | 'message_required'
  | 'message_too_long';

export function validateMessageBody(
  body: unknown,
): MessageValidationError | null {
  if (typeof body !== 'string') return 'message_required';
  const trimmed = body.trim();
  if (!trimmed) return 'message_required';
  if (trimmed.length > MAX_MESSAGE_LENGTH) return 'message_too_long';
  return null;
}
