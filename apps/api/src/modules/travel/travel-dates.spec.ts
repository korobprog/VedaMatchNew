import {
  countNights,
  formatStayDate,
  MAX_NIGHTS,
  parseStayDate,
  parseStayRange,
  rangesOverlap,
  TravelDateError,
} from './travel-dates';

const today = new Date(Date.UTC(2026, 8, 10));

describe('parseStayDate', () => {
  it('разбирает ГГГГ-ММ-ДД в полночь UTC', () => {
    const date = parseStayDate('2026-09-10', 'заезд');
    expect(date.toISOString()).toBe('2026-09-10T00:00:00.000Z');
  });

  it('не пускает несуществующее число вместо тихого переезда на март', () => {
    expect(() => parseStayDate('2026-02-30', 'заезд')).toThrow(TravelDateError);
  });

  it('не пускает не-дату', () => {
    expect(() => parseStayDate('завтра', 'заезд')).toThrow(TravelDateError);
    expect(() => parseStayDate(20260910, 'заезд')).toThrow(TravelDateError);
    expect(() => parseStayDate(undefined, 'заезд')).toThrow(TravelDateError);
  });

  it('formatStayDate возвращает то же, что разобрал', () => {
    expect(formatStayDate(parseStayDate('2026-12-31', 'выезд'))).toBe(
      '2026-12-31',
    );
  });
});

describe('countNights', () => {
  it('считает ночи, а не сутки между метками времени', () => {
    expect(
      countNights(
        parseStayDate('2026-09-10', 'заезд'),
        parseStayDate('2026-09-13', 'выезд'),
      ),
    ).toBe(3);
  });

  it('не сбивается на переходе через смену месяца', () => {
    expect(
      countNights(
        parseStayDate('2026-10-30', 'заезд'),
        parseStayDate('2026-11-02', 'выезд'),
      ),
    ).toBe(3);
  });
});

describe('parseStayRange', () => {
  it('возвращает промежуток с числом ночей', () => {
    const range = parseStayRange('2026-09-11', '2026-09-14', today);
    expect(range.nights).toBe(3);
    expect(formatStayDate(range.checkIn)).toBe('2026-09-11');
  });

  it('пускает заезд сегодня', () => {
    expect(parseStayRange('2026-09-10', '2026-09-11', today).nights).toBe(1);
  });

  it('не пускает выезд в день заезда', () => {
    expect(() => parseStayRange('2026-09-11', '2026-09-11', today)).toThrow(
      TravelDateError,
    );
  });

  it('не пускает выезд раньше заезда', () => {
    expect(() => parseStayRange('2026-09-14', '2026-09-11', today)).toThrow(
      TravelDateError,
    );
  });

  it('не пускает заезд задним числом', () => {
    expect(() => parseStayRange('2026-09-09', '2026-09-12', today)).toThrow(
      TravelDateError,
    );
  });

  it(`не пускает больше ${MAX_NIGHTS} ночей одной заявкой`, () => {
    expect(() => parseStayRange('2026-09-11', '2026-10-13', today)).toThrow(
      TravelDateError,
    );
  });

  it('не пускает заезд больше чем через год — это опечатка в годе', () => {
    expect(() => parseStayRange('2028-09-11', '2028-09-12', today)).toThrow(
      TravelDateError,
    );
  });
});

describe('rangesOverlap', () => {
  const range = (checkIn: string, checkOut: string) => ({
    checkIn: parseStayDate(checkIn, 'заезд'),
    checkOut: parseStayDate(checkOut, 'выезд'),
  });

  it('видит пересечение', () => {
    expect(
      rangesOverlap(
        range('2026-09-10', '2026-09-14'),
        range('2026-09-12', '2026-09-16'),
      ),
    ).toBe(true);
  });

  it('видит вложенный промежуток', () => {
    expect(
      rangesOverlap(
        range('2026-09-10', '2026-09-20'),
        range('2026-09-12', '2026-09-14'),
      ),
    ).toBe(true);
  });

  it('не считает пересечением выезд в день чужого заезда', () => {
    expect(
      rangesOverlap(
        range('2026-09-10', '2026-09-12'),
        range('2026-09-12', '2026-09-15'),
      ),
    ).toBe(false);
  });

  it('не считает пересечением разнесённые промежутки', () => {
    expect(
      rangesOverlap(
        range('2026-09-10', '2026-09-12'),
        range('2026-09-20', '2026-09-22'),
      ),
    ).toBe(false);
  });
});
