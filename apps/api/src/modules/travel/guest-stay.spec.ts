import { CashInputError } from './cash-input';
import { parseEntryGuest, parseGuestInput } from './guest-input';
import { compareGuests, paidThrough, unpaidNights } from './guest-stay';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('paidThrough', () => {
  it('две ночи с 18 мая — оплачено по 19 мая включительно', () => {
    expect(paidThrough(d('2026-05-18'), 2)).toEqual(d('2026-05-19'));
  });

  it('без оплат — срока нет', () => {
    expect(paidThrough(d('2026-05-18'), 0)).toBeNull();
  });

  it('переходит через месяц и год', () => {
    expect(paidThrough(d('2026-12-30'), 10)).toEqual(d('2027-01-08'));
  });
});

describe('unpaidNights', () => {
  const checkIn = d('2026-05-18');

  it('живущему засчитывается ночь на сегодня', () => {
    // 18, 19, 20 — три ночи по 20-е включительно, оплачены две.
    expect(
      unpaidNights(checkIn, null, 2, new Date('2026-05-20T15:00:00Z')),
    ).toBe(1);
  });

  it('оплачено вперёд — долга нет', () => {
    expect(unpaidNights(checkIn, null, 10, d('2026-05-20'))).toBe(0);
  });

  it('выехавшему считаются ночи до дня выезда', () => {
    expect(unpaidNights(checkIn, d('2026-05-21'), 2, d('2026-09-14'))).toBe(1);
  });

  it('заезд в будущем долга не даёт', () => {
    expect(unpaidNights(d('2026-10-01'), null, 0, d('2026-09-14'))).toBe(0);
  });
});

describe('compareGuests', () => {
  it('живущие сверху по имени, выехавшие ниже — свежие первыми', () => {
    const guests = [
      { fullName: 'Борис', leftOn: d('2026-05-01') },
      { fullName: 'Яна', leftOn: null },
      { fullName: 'Анна', leftOn: d('2026-06-01') },
      { fullName: 'Вера', leftOn: null },
    ];
    expect(guests.sort(compareGuests).map((g) => g.fullName)).toEqual([
      'Вера',
      'Яна',
      'Анна',
      'Борис',
    ]);
  });
});

describe('parseGuestInput', () => {
  const valid = {
    fullName: '  Соловьёв Кирилл ',
    phone: '+7 900 000-00-00',
    keyLabel: '14',
    roomId: 'room-1',
    personalInfo: 'Приехал на фестиваль',
    color: 'cyan',
    checkInOn: '2026-05-18',
  };

  it('разбирает карточку', () => {
    expect(parseGuestInput(valid)).toMatchObject({
      fullName: 'Соловьёв Кирилл',
      color: 'cyan',
      checkInOn: d('2026-05-18'),
      leftOn: null,
    });
  });

  it('без цвета — none', () => {
    expect(parseGuestInput({ ...valid, color: undefined }).color).toBe('none');
  });

  it('не принимает цвет в виде кода', () => {
    expect(() => parseGuestInput({ ...valid, color: '#ff00aa' })).toThrow(
      'цвет',
    );
  });

  it('требует имя', () => {
    expect(() => parseGuestInput({ ...valid, fullName: ' ' })).toThrow(
      CashInputError,
    );
  });

  it('выезд раньше заезда — ошибка, в тот же день — можно', () => {
    expect(() => parseGuestInput({ ...valid, leftOn: '2026-05-17' })).toThrow(
      'раньше заезда',
    );
    expect(parseGuestInput({ ...valid, leftOn: '2026-05-18' }).leftOn).toEqual(
      d('2026-05-18'),
    );
  });
});

describe('parseEntryGuest', () => {
  it('доход от гостя за сутки', () => {
    expect(parseEntryGuest({ guestId: 'g1', nights: 2 }, 'income')).toEqual({
      guestId: 'g1',
      nights: 2,
    });
  });

  it('гость без суток — можно: разовая оплата стирки', () => {
    expect(parseEntryGuest({ guestId: 'g1' }, 'income')).toEqual({
      guestId: 'g1',
      nights: null,
    });
  });

  it('сутки без гостя или у расхода — ошибка', () => {
    expect(() => parseEntryGuest({ nights: 2 }, 'income')).toThrow('гость');
    expect(() =>
      parseEntryGuest({ guestId: 'g1', nights: 2 }, 'expense'),
    ).toThrow('гость');
  });

  it.each([0, 1.5, 367, '2'])('не принимает сутки %p', (nights) => {
    expect(() => parseEntryGuest({ guestId: 'g1', nights }, 'income')).toThrow(
      CashInputError,
    );
  });
});
