import { TRAVEL_OCCUPANCY_MAX_DAYS } from '@vedamatch/shared';
import {
  DEFAULT_OCCUPANCY_DAYS,
  groupOccupancy,
  MANAGED_OCCUPANCY_STATUSES,
  OCCUPYING_STATUSES,
  parseOccupancyWindow,
} from './occupancy';
import { formatStayDate, parseStayDate, TravelDateError } from './travel-dates';

// Середина дня: окно по умолчанию обязано начинаться с полуночи UTC.
const today = new Date(Date.UTC(2026, 8, 15, 17, 30));

const day = (iso: string) => parseStayDate(iso, 'тест');

describe('parseOccupancyWindow', () => {
  it('без параметров — от сегодняшней полуночи на два месяца', () => {
    const { from, to } = parseOccupancyWindow(undefined, undefined, today);
    expect(from.toISOString()).toBe('2026-09-15T00:00:00.000Z');
    expect(formatStayDate(to)).toBe('2026-11-14');
    expect(DEFAULT_OCCUPANCY_DAYS).toBe(60);
  });

  it('пустые строки из query считаются отсутствующими', () => {
    const { from } = parseOccupancyWindow('', '', today);
    expect(formatStayDate(from)).toBe('2026-09-15');
  });

  it('только from — окно по умолчанию отсчитывается от него', () => {
    const { from, to } = parseOccupancyWindow('2026-10-01', undefined, today);
    expect(formatStayDate(from)).toBe('2026-10-01');
    expect(formatStayDate(to)).toBe('2026-11-30');
  });

  it('принимает прошлые даты: хозяин листает назад', () => {
    const { from, to } = parseOccupancyWindow(
      '2026-08-01',
      '2026-09-01',
      today,
    );
    expect(formatStayDate(from)).toBe('2026-08-01');
    expect(formatStayDate(to)).toBe('2026-09-01');
  });

  it('не пускает кривую дату', () => {
    expect(() => parseOccupancyWindow('завтра', undefined, today)).toThrow(
      TravelDateError,
    );
    expect(() =>
      parseOccupancyWindow('2026-09-01', '2026-02-30', today),
    ).toThrow(TravelDateError);
  });

  it('конец раньше начала или равен ему — ошибка', () => {
    expect(() =>
      parseOccupancyWindow('2026-09-10', '2026-09-01', today),
    ).toThrow(TravelDateError);
    expect(() =>
      parseOccupancyWindow('2026-09-10', '2026-09-10', today),
    ).toThrow(TravelDateError);
  });

  it('длина окна ограничена сверху, граница включительно', () => {
    const from = day('2026-01-01');
    const edge = new Date(
      from.getTime() + TRAVEL_OCCUPANCY_MAX_DAYS * 24 * 60 * 60 * 1000,
    );
    expect(() =>
      parseOccupancyWindow('2026-01-01', formatStayDate(edge), today),
    ).not.toThrow();
    const over = new Date(edge.getTime() + 24 * 60 * 60 * 1000);
    expect(() =>
      parseOccupancyWindow('2026-01-01', formatStayDate(over), today),
    ).toThrow(TravelDateError);
  });
});

describe('статусы занятости', () => {
  it('гостю — те же, что держат комнату при проверке заявки', () => {
    expect([...OCCUPYING_STATUSES]).toEqual([
      'new_request',
      'accepted',
      'checked_in',
    ]);
  });

  it('хозяину — ещё и завершённые, но не отказы и отмены', () => {
    expect(MANAGED_OCCUPANCY_STATUSES).toContain('completed');
    expect(MANAGED_OCCUPANCY_STATUSES).not.toContain('declined');
    expect(MANAGED_OCCUPANCY_STATUSES).not.toContain('cancelled');
  });
});

describe('groupOccupancy', () => {
  const window = { from: day('2026-09-01'), to: day('2026-10-01') };
  const rooms = [{ id: 'r1' }, { id: 'r2' }];
  const booking = (
    id: string,
    roomId: string | null,
    checkIn: string,
    checkOut: string,
  ) => ({ id, roomId, checkIn: day(checkIn), checkOut: day(checkOut) });

  it('раскладывает по комнатам в порядке заезда, пустые комнаты остаются', () => {
    const result = groupOccupancy(
      rooms,
      [
        booking('b', 'r1', '2026-09-20', '2026-09-22'),
        booking('a', 'r1', '2026-09-05', '2026-09-07'),
      ],
      window,
    );
    expect(result.rooms.map((entry) => entry.room.id)).toEqual(['r1', 'r2']);
    expect(result.rooms[0].bookings.map((entry) => entry.id)).toEqual([
      'a',
      'b',
    ]);
    expect(result.rooms[1].bookings).toEqual([]);
    expect(result.unassigned).toEqual([]);
  });

  it('заявки без комнаты и с чужой комнатой — в «без комнаты»', () => {
    const result = groupOccupancy(
      rooms,
      [
        booking('none', null, '2026-09-05', '2026-09-07'),
        booking('gone', 'r9', '2026-09-08', '2026-09-09'),
      ],
      window,
    );
    expect(result.unassigned.map((entry) => entry.id)).toEqual([
      'none',
      'gone',
    ]);
  });

  it('промежуток через край окна не обрезается, вне окна — отбрасывается', () => {
    const result = groupOccupancy(
      rooms,
      [
        booking('edge', 'r2', '2026-08-28', '2026-09-03'),
        booking('before', 'r2', '2026-08-20', '2026-09-01'),
        booking('after', 'r2', '2026-10-01', '2026-10-03'),
      ],
      window,
    );
    const kept = result.rooms[1].bookings;
    expect(kept.map((entry) => entry.id)).toEqual(['edge']);
    expect(formatStayDate(kept[0].checkIn)).toBe('2026-08-28');
    expect(formatStayDate(kept[0].checkOut)).toBe('2026-09-03');
  });
});
