import type { MarketOrderStatus } from '@vedamatch/shared';

export type OrderActor = 'buyer' | 'seller';

/**
 * Кто и куда может перевести заявку.
 *
 * Оплаты на Рынке нет, поэтому «жизненный цикл» здесь — это договорённость
 * двух людей, а не платёжный конвейер. Отсюда правила:
 * - подтверждает и отклоняет только продавец: это его товар;
 * - отменяет только покупатель, и только пока работа не начата — после
 *   `in_progress` продавец уже потратил время, и снимать заявку в одностороннем
 *   порядке нечестно, договариваться нужно в чате;
 * - завершает только продавец: он видит, что передал товар;
 * - из завершённой и отменённой не выходит никто. Заявка — не задача в трекере,
 *   переоткрытие ломало бы отзыв, который на неё опирается.
 */
const TRANSITIONS: Record<
  MarketOrderStatus,
  Partial<Record<OrderActor, MarketOrderStatus[]>>
> = {
  new_request: {
    seller: ['accepted', 'declined_by_seller'],
    buyer: ['cancelled_by_buyer'],
  },
  accepted: {
    seller: ['in_progress', 'completed', 'declined_by_seller'],
    buyer: ['cancelled_by_buyer'],
  },
  in_progress: {
    seller: ['completed', 'declined_by_seller'],
  },
  completed: {},
  declined_by_seller: {},
  cancelled_by_buyer: {},
};

/** Статусы, после которых заявка закрыта и больше не меняется. */
export const FINAL_STATUSES: MarketOrderStatus[] = [
  'completed',
  'declined_by_seller',
  'cancelled_by_buyer',
];

export function isFinalStatus(status: MarketOrderStatus): boolean {
  return FINAL_STATUSES.includes(status);
}

/** Куда актор может перевести заявку из текущего состояния. */
export function availableTransitions(
  status: MarketOrderStatus,
  actor: OrderActor,
): MarketOrderStatus[] {
  return TRANSITIONS[status]?.[actor] ?? [];
}

export function canTransition(
  status: MarketOrderStatus,
  next: MarketOrderStatus,
  actor: OrderActor,
): boolean {
  return availableTransitions(status, actor).includes(next);
}

/**
 * Отметки времени, которые ставит переход. Возвращаем объект для `data`
 * прямо в апдейт: держать эту логику в сервисе — значит однажды перевести
 * заявку в completed и забыть проставить completedAt.
 */
export function transitionTimestamps(
  next: MarketOrderStatus,
  now: Date,
): { acceptedAt?: Date; completedAt?: Date; closedAt?: Date } {
  switch (next) {
    case 'accepted':
      return { acceptedAt: now };
    case 'completed':
      return { completedAt: now, closedAt: now };
    case 'declined_by_seller':
    case 'cancelled_by_buyer':
      return { closedAt: now };
    default:
      return {};
  }
}
