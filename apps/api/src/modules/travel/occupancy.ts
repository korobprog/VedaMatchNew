import {
  TRAVEL_OCCUPANCY_MAX_DAYS,
  type TravelBookingStatus,
} from '@vedamatch/shared';
import {
  countNights,
  parseStayDate,
  rangesOverlap,
  TravelDateError,
} from './travel-dates';

/**
 * Занятость комнат для календарей гостя и хозяина. Чистая логика отдельно от
 * сервиса: окно запроса и раскладка заявок по комнатам проверяются тестом без
 * базы.
 */

/**
 * Статусы, при которых комната держится за гостем. Тот же список, что в
 * проверке `assertRoomFree`: календарь, показывающий свободной комнату, на
 * которую сервер откажет, хуже, чем никакого.
 */
export const OCCUPYING_STATUSES = [
  'new_request',
  'accepted',
  'checked_in',
] as const satisfies readonly TravelBookingStatus[];

/** Хозяину нужна и история: завершённый заезд тоже стоит в шахматке. */
export const MANAGED_OCCUPANCY_STATUSES = [
  ...OCCUPYING_STATUSES,
  'completed',
] as const satisfies readonly TravelBookingStatus[];

/** Окно по умолчанию — два месяца от сегодня: столько видно в двух сетках. */
export const DEFAULT_OCCUPANCY_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Окно запроса занятости `[from, to)`. `today` снаружи — как в
 * parseStayRange, чтобы тест не зависел от часа запуска. Верхняя граница
 * длины нужна не ради красоты: без неё один запрос вытащил бы все заявки
 * объекта за годы.
 */
export function parseOccupancyWindow(
  rawFrom: unknown,
  rawTo: unknown,
  today: Date,
): { from: Date; to: Date } {
  const from = isBlank(rawFrom)
    ? new Date(
        Date.UTC(
          today.getUTCFullYear(),
          today.getUTCMonth(),
          today.getUTCDate(),
        ),
      )
    : parseStayDate(rawFrom, 'с');
  const to = isBlank(rawTo)
    ? new Date(from.getTime() + DEFAULT_OCCUPANCY_DAYS * DAY_MS)
    : parseStayDate(rawTo, 'по');

  const days = countNights(from, to);
  if (days < 1) {
    throw new TravelDateError('Конец промежутка должен быть позже начала');
  }
  if (days > TRAVEL_OCCUPANCY_MAX_DAYS) {
    throw new TravelDateError(
      `Занятость показывается не больше чем за ${TRAVEL_OCCUPANCY_MAX_DAYS} дней`,
    );
  }
  return { from, to };
}

export interface OccupancyRoomRow {
  id: string;
}

export interface OccupancyBookingRow {
  roomId: string | null;
  checkIn: Date;
  checkOut: Date;
}

export interface GroupedOccupancy<R, B> {
  rooms: { room: R; bookings: B[] }[];
  unassigned: B[];
}

/**
 * Разложить заявки по комнатам. Промежутки не обрезаются по окну: календарь
 * сам решает, что попало в месяц, а обрезанный выезд выглядел бы как
 * настоящий. Отбрасываются только заявки целиком вне окна.
 *
 * Заявка с комнатой, которой нет в списке, уходит в «без комнаты»: так
 * она остаётся на глазах у хозяина, а не пропадает молча.
 */
export function groupOccupancy<
  R extends OccupancyRoomRow,
  B extends OccupancyBookingRow,
>(
  rooms: readonly R[],
  bookings: readonly B[],
  window: { from: Date; to: Date },
): GroupedOccupancy<R, B> {
  const byRoom = new Map<string, B[]>(rooms.map((room) => [room.id, []]));
  const unassigned: B[] = [];
  const sorted = bookings
    .filter((booking) =>
      rangesOverlap(booking, { checkIn: window.from, checkOut: window.to }),
    )
    .sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime());

  for (const booking of sorted) {
    const list = booking.roomId ? byRoom.get(booking.roomId) : undefined;
    if (list) list.push(booking);
    else unassigned.push(booking);
  }

  return {
    rooms: rooms.map((room) => ({ room, bookings: byRoom.get(room.id) ?? [] })),
    unassigned,
  };
}
