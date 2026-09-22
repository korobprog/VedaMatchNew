import type { ChatConferenceLinkState } from '@vedamatch/shared';

/**
 * Сколько живёт комната быстрой конференции — чистым модулем, без Prisma.
 *
 * ## Задача
 *
 * Дверь конференции закрывается через `CHAT_CONFERENCE_LINK_TTL_HOURS`
 * часов, а комната — обычная групповая беседа — до сих пор оставалась
 * навсегда. Нажал «Быстрая конференция», передумал звать, закрыл вкладку —
 * и в списке бесед навсегда поселилась пустая строка «Конференция · Имя».
 * У человека, который нажимает кнопку раз в неделю, за год их полсотни.
 *
 * ## Правило
 *
 * Оно намеренно однобокое, и это главное решение здесь.
 *
 * 1. **Убирается только по-настоящему пустая комната** — та, где НЕ
 *    сказано ни одного слова. Раз сообщений нет, то нет и вложений:
 *    файл в портале рождается только сообщением, а значит, удаление
 *    беседы не оставляет мусора в S3 и не требует своей чистки бакета.
 *    Срок — `CHAT_CONFERENCE_EMPTY_DAYS` суток ПОСЛЕ того, как дверь
 *    закрылась, а не после создания: пока ссылка работает, комната ещё
 *    кому-то нужна.
 * 2. **Всё, где сказано хоть слово, не трогается никогда.** Ни удаления,
 *    ни перевода в архив по таймеру. Это переписка живых людей, и её
 *    судьбу решают они сами — кнопкой «выйти из беседы», как в любой
 *    другой группе. Автоматика, стирающая разговор, который был, — это
 *    потеря, которую нечем возместить, а выигрыш от неё чисто
 *    бухгалтерский.
 * 3. **Новая ссылка обнуляет отсчёт.** Срок считается от `expiresAt`
 *    (или `revokedAt`, если вход закрыли раньше), а «выдать новую ссылку»
 *    двигает `expiresAt` вперёд. Отдельного «продлить комнату» не нужно:
 *    хозяин, которому комната ещё нужна, и так жмёт «новую ссылку».
 *
 * ## Что видит опоздавший
 *
 * Пока комната есть, протухшая ссылка отвечает своим текстом про срок или
 * про закрытый вход (`conferenceDenialText`). Когда пустую комнату убрали,
 * токена больше нет, и ответ — `conferenceGoneText()`: не «404» и не
 * «ссылка недействительна», а объяснение, что делать дальше.
 */

/**
 * Неделя после закрытия двери. Короче суток — и комната исчезает раньше,
 * чем хозяин успел разобрать, почему встреча не состоялась; дольше недели —
 * и смысл уборки теряется, пустых строк всё равно накапливается.
 */
export const DEFAULT_CONFERENCE_EMPTY_DAYS = 7;

/** Границы разумного: ниже суток чистка обгоняет человека, выше года — бессмысленна. */
const MIN_EMPTY_DAYS = 1;
const MAX_EMPTY_DAYS = 365;

/**
 * Срок из переменной окружения. Мусор в настройке не должен ни ронять
 * старт, ни молча включать нулевой срок: непонятное значение — это
 * значение по умолчанию, а не «стирать сразу». Ровно как у
 * `retentionDays()` в `chat-retention.ts`.
 */
export function conferenceEmptyDays(raw: string | undefined): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value))
    return DEFAULT_CONFERENCE_EMPTY_DAYS;
  if (value < MIN_EMPTY_DAYS || value > MAX_EMPTY_DAYS)
    return DEFAULT_CONFERENCE_EMPTY_DAYS;
  return value;
}

/**
 * Когда дверь закрылась. Отзыв сильнее срока и может случиться раньше
 * него — считаем от того, что наступило первым. Дверь, которая ещё
 * работает, не закрыта вовсе: `null`.
 */
export function conferenceDoorClosedAt(
  link: { expiresAt: Date; revokedAt: Date | null },
  now: Date,
): Date | null {
  const closed = link.revokedAt
    ? new Date(Math.min(link.revokedAt.getTime(), link.expiresAt.getTime()))
    : link.expiresAt;
  return closed.getTime() <= now.getTime() ? closed : null;
}

/** Граница: комнаты, чья дверь закрылась раньше неё, пора рассматривать. */
export function conferenceSweepCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export type ConferenceSweepVerdict =
  /** Дверь ещё открыта либо закрылась недавно — рано. */
  | { kind: 'keep'; reason: 'door_open' | 'too_soon' }
  /** В комнате говорили: не трогаем никогда. */
  | { kind: 'keep'; reason: 'has_messages' }
  /** Пусто и срок вышел — убираем беседу целиком. */
  | { kind: 'delete' };

/**
 * Судьба одной комнаты. Вынесено из воркера, потому что ошибка здесь —
 * это удалённый разговор, и проверять её надо таблицей случаев, а не
 * поднятой базой.
 *
 * Порядок проверок — часть правила: «говорили» проверяется РАНЬШЕ срока,
 * чтобы ни одна перестановка условий в будущем не смогла превратить
 * «давно» в «удалить» для комнаты с перепиской.
 */
export function conferenceSweepVerdict(
  room: {
    state: ChatConferenceLinkState;
    messageCount: number;
    expiresAt: Date;
    revokedAt: Date | null;
  },
  now: Date,
  days: number = DEFAULT_CONFERENCE_EMPTY_DAYS,
): ConferenceSweepVerdict {
  if (room.messageCount > 0) return { kind: 'keep', reason: 'has_messages' };
  if (room.state === 'active') return { kind: 'keep', reason: 'door_open' };
  const closedAt = conferenceDoorClosedAt(room, now);
  if (!closedAt) return { kind: 'keep', reason: 'door_open' };
  return closedAt.getTime() <= conferenceSweepCutoff(now, days).getTime()
    ? { kind: 'delete' }
    : { kind: 'keep', reason: 'too_soon' };
}

/**
 * Что читает человек, открывший ссылку на комнату, которой уже нет.
 *
 * Отдельный текст, а не общее «страница не найдена»: пришедший по ссылке
 * не сделал ничего неправильного и не должен гадать, ошибся ли он адресом.
 * Про уборку не говорим — ему важно не «почему», а «что теперь».
 */
export function conferenceGoneText(): string {
  return 'Этой конференции больше нет. Попросите новую ссылку у того, кто вас позвал.';
}
