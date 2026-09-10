import { formatStayDate } from './travel-dates';
import {
  calcTotalMinor,
  parseBookingInput,
  parsePhone,
  parsePriceMinor,
  parseStayInput,
  TravelInputError,
} from './travel-dto';

const today = new Date(Date.UTC(2026, 8, 10));

const booking = (patch: Record<string, unknown> = {}) => ({
  stayId: 'stay-1',
  guestName: '  Радха   Мохан  ',
  guestPhone: '+7 (999) 123-45-67',
  checkIn: '2026-09-11',
  checkOut: '2026-09-14',
  guests: 2,
  ...patch,
});

describe('parseBookingInput', () => {
  it('складывает заявку и считает ночи', () => {
    const parsed = parseBookingInput(booking(), today);
    expect(parsed.nights).toBe(3);
    expect(formatStayDate(parsed.checkIn)).toBe('2026-09-11');
    expect(parsed.guests).toBe(2);
  });

  it('схлопывает лишние пробелы в имени', () => {
    expect(parseBookingInput(booking(), today).guestName).toBe('Радха Мохан');
  });

  it('по умолчанию гость один', () => {
    const parsed = parseBookingInput(booking({ guests: undefined }), today);
    expect(parsed.guests).toBe(1);
  });

  it('пустой комментарий превращает в null, а не в пустую строку', () => {
    expect(
      parseBookingInput(booking({ comment: '   ' }), today).comment,
    ).toBeNull();
  });

  it('не пускает заявку без имени', () => {
    expect(() => parseBookingInput(booking({ guestName: ' ' }), today)).toThrow(
      TravelInputError,
    );
  });

  it('не пускает нецелое или отрицательное число гостей', () => {
    expect(() => parseBookingInput(booking({ guests: 2.5 }), today)).toThrow(
      TravelInputError,
    );
    expect(() => parseBookingInput(booking({ guests: 0 }), today)).toThrow(
      TravelInputError,
    );
  });

  it('пропускает ошибку дат наружу', () => {
    expect(() =>
      parseBookingInput(booking({ checkOut: '2026-09-11' }), today),
    ).toThrow();
  });
});

describe('parsePhone', () => {
  it('оставляет номер таким, как его написали', () => {
    expect(parsePhone('+91 98765 43210')).toBe('+91 98765 43210');
  });

  it('не пускает слишком короткий и слишком длинный', () => {
    expect(() => parsePhone('12345')).toThrow(TravelInputError);
    expect(() => parsePhone('1234567890123456')).toThrow(TravelInputError);
  });
});

describe('parsePriceMinor', () => {
  it('пустое значение — это отсутствие цены', () => {
    expect(parsePriceMinor(undefined)).toBeNull();
    expect(parsePriceMinor(null)).toBeNull();
    expect(parsePriceMinor('')).toBeNull();
  });

  it('не пускает дробную цену: округление копейки станет расхождением', () => {
    expect(() => parsePriceMinor(150.5)).toThrow(TravelInputError);
  });

  it('не пускает отрицательную', () => {
    expect(() => parsePriceMinor(-1)).toThrow(TravelInputError);
  });
});

const stay = (patch: Record<string, unknown> = {}) => ({
  kind: 'hostel',
  name: 'Хостел при храме',
  payment: 'paid',
  priceMinor: 50000,
  ...patch,
});

describe('parseStayInput', () => {
  it('складывает объект', () => {
    const parsed = parseStayInput(stay());
    expect(parsed.kind).toBe('hostel');
    expect(parsed.currency).toBe('rub');
    expect(parsed.priceMinor).toBe(50000);
  });

  it('требует цену у объекта за плату', () => {
    expect(() => parseStayInput(stay({ priceMinor: null }))).toThrow(
      TravelInputError,
    );
  });

  it('требует описания служения у объекта за служение', () => {
    expect(() =>
      parseStayInput(stay({ payment: 'seva', priceMinor: null })),
    ).toThrow(TravelInputError);
  });

  it('принимает объект за служение с описанием и без цены', () => {
    const parsed = parseStayInput(
      stay({ payment: 'seva', priceMinor: null, sevaNote: 'Помощь на кухне' }),
    );
    expect(parsed.priceMinor).toBeNull();
    expect(parsed.sevaNote).toBe('Помощь на кухне');
  });

  it('не пускает неизвестный вид и валюту', () => {
    expect(() => parseStayInput(stay({ kind: 'castle' }))).toThrow(
      TravelInputError,
    );
    expect(() => parseStayInput(stay({ currency: 'btc' }))).toThrow(
      TravelInputError,
    );
  });

  it('не пускает координату вне допустимых значений', () => {
    expect(() => parseStayInput(stay({ lat: 100 }))).toThrow(TravelInputError);
    expect(() => parseStayInput(stay({ lng: -181 }))).toThrow(TravelInputError);
  });

  it('принимает координаты на границе', () => {
    const parsed = parseStayInput(stay({ lat: -90, lng: 180 }));
    expect(parsed.lat).toBe(-90);
    expect(parsed.lng).toBe(180);
  });
});

describe('calcTotalMinor', () => {
  it('берёт цену комнаты, когда она есть', () => {
    expect(calcTotalMinor(3, 50000, 80000)).toBe(240000);
  });

  it('падает на цену объекта, когда у комнаты своей нет', () => {
    expect(calcTotalMinor(3, 50000, null)).toBe(150000);
  });

  it('оставляет null у ночлега за служение, а не подставляет ноль', () => {
    expect(calcTotalMinor(3, null, null)).toBeNull();
  });
});
